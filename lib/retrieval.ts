/**
 * Patient-scoped chart retrieval — RetrievalProvider + the Moss adapter.
 *
 * LICENSING AND PHI BOUNDARY — read before enabling this anywhere real.
 *
 * `@inferedge/moss` is beta software whose own README states: "Not permitted
 * for production or competing commercial use", while the bundled LICENSE.txt
 * (PolyForm Shield 1.0.0) permits any non-competing purpose. Those two
 * statements disagree, and an unresolved licensing contradiction is not
 * something to resolve in our own favour.
 *
 * Moss is also NOT local. Inspecting the published bundle:
 *   - documents are uploaded (PUT, application/octet-stream) to signed storage
 *   - index construction runs at InferEdge — `CreateIndexOptions.onProgress` is
 *     documented as firing "while the server is processing"
 *   - `query()` falls back to a cloud endpoint that receives the raw query text
 *     whenever the index has not been downloaded via loadIndex()
 *
 * So indexing a real chart would send PHI to a third party with no BAA.
 *
 * Therefore: this adapter is permitted ONLY over synthetic records, which is
 * squarely inside the README's "free for testing, evaluation, internal use".
 * `assertRetrievalAllowed()` refuses to index anything not marked synthetic,
 * and pilot mode refuses Moss outright. Production chart retrieval continues to
 * use authorized deterministic Medplum reads; when Moss is unavailable the
 * product reports retrieval as unavailable and never substitutes fixture data.
 */

import { runtimeMode } from "./runtime";

export type RetrievalOrigin = "live" | "cache" | "fixture" | "failed" | "unknown";

export interface RetrievalDoc {
  /** Opaque id. Never a raw patient identifier. */
  id: string;
  text: string;
  metadata: {
    tenant: string;
    patient: string;
    fhirType: string;
    fhirId: string;
    fhirVersion?: string;
    /** Required. The gate below refuses anything that is not explicitly synthetic. */
    synthetic: "true" | "false";
    [k: string]: string | undefined;
  };
}

export interface RetrievedFact {
  text: string;
  score: number;
  fhirType: string;
  fhirId: string;
  fhirVersion?: string;
}

export interface RetrievalResult {
  facts: RetrievedFact[];
  origin: RetrievalOrigin;
  provider: string;
  latencyMs: number;
  indexVersion?: string;
  /** Present when retrieval did not happen. Never silently empty. */
  unavailableReason?: string;
}

export interface RetrievalProvider {
  readonly name: string;
  readonly available: boolean;
  indexPatient(indexName: string, docs: RetrievalDoc[]): Promise<{ ok: boolean; indexVersion?: string; error?: string }>;
  warm(indexName: string): Promise<boolean>;
  query(indexName: string, query: string, opts?: { topK?: number; tenant: string; patient: string }): Promise<RetrievalResult>;
  deleteIndex(indexName: string): Promise<boolean>;
}

export class RetrievalProhibitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalProhibitedError";
  }
}

/**
 * The PHI gate. Fails closed on both axes: mode and data marking.
 *
 * This is deliberately not a config flag someone can flip — a real chart simply
 * has no way to be marked synthetic, so it cannot pass.
 */
export function assertRetrievalAllowed(docs: RetrievalDoc[]): void {
  if (runtimeMode() === "pilot") {
    throw new RetrievalProhibitedError(
      "Moss is prohibited in pilot mode: it is beta software, its README forbids production use, " +
        "and index construction happens on InferEdge servers with no BAA in place."
    );
  }
  const real = docs.filter((d) => d.metadata.synthetic !== "true");
  if (real.length) {
    throw new RetrievalProhibitedError(
      `Refusing to index ${real.length} document(s) not marked synthetic. Moss uploads document ` +
        `text to a third party; only generated test records may be sent.`
    );
  }
}

/* ------------------------------------------------------------------ */
/* Moss adapter                                                        */
/* ------------------------------------------------------------------ */

const projectId = process.env.MOSS_PROJECT_ID;
const projectKey = process.env.MOSS_PROJECT_KEY;

export const mossConfigured = Boolean(projectId && projectKey);

export class MossRetrievalProvider implements RetrievalProvider {
  readonly name = "moss";
  private client: unknown = null;
  private loaded = new Set<string>();

  get available(): boolean {
    return mossConfigured && runtimeMode() !== "pilot";
  }

  private async getClient() {
    if (!mossConfigured) {
      throw new RetrievalProhibitedError("MOSS_PROJECT_ID / MOSS_PROJECT_KEY are not configured");
    }
    if (!this.client) {
      const { MossClient } = await import("@inferedge/moss");
      this.client = new MossClient(projectId!, projectKey!);
    }
    return this.client as {
      createIndex(n: string, d: unknown[], o?: unknown): Promise<{ jobId?: string }>;
      loadIndex(n: string, o?: unknown): Promise<string>;
      query(n: string, q: string, o?: unknown): Promise<{ results?: unknown[] }>;
      deleteIndex(n: string): Promise<boolean>;
    };
  }

  async indexPatient(indexName: string, docs: RetrievalDoc[]) {
    assertRetrievalAllowed(docs);
    try {
      const c = await this.getClient();
      const res = await c.createIndex(
        indexName,
        docs.map((d) => ({ id: d.id, text: d.text, metadata: d.metadata }))
      );
      return { ok: true, indexVersion: res?.jobId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Download the index so queries run in memory rather than hitting the cloud. */
  async warm(indexName: string): Promise<boolean> {
    try {
      const c = await this.getClient();
      await c.loadIndex(indexName);
      this.loaded.add(indexName);
      return true;
    } catch {
      return false;
    }
  }

  async query(
    indexName: string,
    query: string,
    opts?: { topK?: number; tenant: string; patient: string }
  ): Promise<RetrievalResult> {
    const t0 = Date.now();
    if (!this.available) {
      // Unavailable is a RESULT, not an empty success. The caller must be able
      // to drop the retrieval claim rather than show a confident empty answer.
      return {
        facts: [],
        origin: "failed",
        provider: this.name,
        latencyMs: 0,
        unavailableReason: mossConfigured
          ? "Moss is disabled in pilot mode (licensing and PHI gate)"
          : "MOSS_PROJECT_ID / MOSS_PROJECT_KEY are not configured",
      };
    }

    try {
      const c = await this.getClient();
      const res = await c.query(indexName, query, { topK: opts?.topK ?? 5 });
      const rows = (res?.results ?? []) as {
        text?: string;
        score?: number;
        metadata?: Record<string, string>;
      }[];

      // Mandatory scope filter. Never trust the index alone to isolate patients.
      const scoped = rows.filter(
        (r) =>
          (!opts?.tenant || r.metadata?.tenant === opts.tenant) &&
          (!opts?.patient || r.metadata?.patient === opts.patient)
      );

      return {
        facts: scoped.map((r) => ({
          text: String(r.text ?? ""),
          score: Number(r.score ?? 0),
          fhirType: r.metadata?.fhirType ?? "unknown",
          fhirId: r.metadata?.fhirId ?? "unknown",
          fhirVersion: r.metadata?.fhirVersion,
        })),
        origin: this.loaded.has(indexName) ? "cache" : "live",
        provider: this.name,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        facts: [],
        origin: "failed",
        provider: this.name,
        latencyMs: Date.now() - t0,
        unavailableReason: (err as Error).message,
      };
    }
  }

  async deleteIndex(indexName: string): Promise<boolean> {
    try {
      const c = await this.getClient();
      return await c.deleteIndex(indexName);
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

/**
 * Build retrieval documents from a chart slice.
 *
 * Minimised on purpose: medications, conditions, and allergies only. The index
 * id is opaque and the patient key lives in metadata used for mandatory
 * server-side filtering, so no raw identifier ends up in an index name.
 */
export function projectChartToDocs(
  chart: {
    medications?: { id?: string; name?: string; dosage?: string; startedDaysAgo?: number }[];
    conditions?: { id?: string; text?: string }[];
    allergies?: { id?: string; text?: string }[];
  },
  scope: { tenant: string; patient: string; synthetic: boolean }
): RetrievalDoc[] {
  const docs: RetrievalDoc[] = [];
  const mark = scope.synthetic ? "true" : "false";

  for (const m of chart.medications ?? []) {
    docs.push({
      id: `med-${m.id || m.name}`,
      text: `Medication ${m.name ?? ""} ${m.dosage ?? ""}`.trim() +
        (m.startedDaysAgo !== undefined ? `, started ${m.startedDaysAgo} days ago` : ""),
      metadata: {
        tenant: scope.tenant, patient: scope.patient,
        fhirType: "MedicationRequest", fhirId: m.id ?? "", synthetic: mark,
      },
    });
  }
  for (const c of chart.conditions ?? []) {
    docs.push({
      id: `cond-${c.id || c.text}`,
      text: `Condition ${c.text ?? ""}`,
      metadata: {
        tenant: scope.tenant, patient: scope.patient,
        fhirType: "Condition", fhirId: c.id ?? "", synthetic: mark,
      },
    });
  }
  for (const a of chart.allergies ?? []) {
    docs.push({
      id: `alg-${a.id || a.text}`,
      text: `Allergy ${a.text ?? ""}`,
      metadata: {
        tenant: scope.tenant, patient: scope.patient,
        fhirType: "AllergyIntolerance", fhirId: a.id ?? "", synthetic: mark,
      },
    });
  }
  return docs;
}

export const retrieval: RetrievalProvider = new MossRetrievalProvider();
