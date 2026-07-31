/**
 * Medplum data layer.
 *
 * Live when MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET are present; otherwise the
 * synthetic fixture is served through the identical interface. Every call is
 * timed, and every result reports whether it was simulated — the UI shows that
 * honestly rather than implying a live backend that isn't there.
 */

import { MedplumClient, ClientStorage, MemoryStorage } from "@medplum/core";
import {
  chartSlice,
  emptyChartSlice,
  calendarDaysAgo,
  type ChartSlice,
  PATIENT_ID,
  FIXTURE_IDENTIFIER_SYSTEM,
} from "./fixtures";
import { assertFixtureAllowed } from "./runtime";

export interface Timed<T> {
  data: T;
  ms: number;
  simulated: boolean;
  /** Why a result degraded. Present when an integration failed. */
  detail?: string;
}

const baseUrl = process.env.MEDPLUM_BASE_URL || "https://api.medplum.com/";
const clientId = process.env.MEDPLUM_CLIENT_ID;
const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

export const medplumConfigured = Boolean(clientId && clientSecret);

let client: MedplumClient | null = null;
let authPromise: Promise<void> | null = null;
/** Reason the client is unavailable. Surfaced to the write receipt, not just the console. */
let lastAuthError: string | undefined;

async function getClient(): Promise<MedplumClient | null> {
  if (!medplumConfigured) return null;
  // Storage MUST be explicit on the server.
  //
  // MedplumClient defaults to `localStorage` whenever that global exists. Node
  // 24 and earlier have no such global, so it quietly picked memory storage and
  // this worked. Node 25 defines a `localStorage` global that is inert unless
  // the process was started with `--localstorage-file`, so client login fails
  // with "this.storage.removeItem is not a function" — and because the catch
  // below degrades to the fixture, a fully-credentialed Medplum project silently
  // served synthetic data instead. Pinning in-memory storage makes the server
  // path behave identically on every Node version; it also keeps the service
  // account's tokens out of any persistent store, which is what we want anyway.
  if (!client) client = new MedplumClient({ baseUrl, storage: new ClientStorage(new MemoryStorage()) });
  if (!authPromise) {
    authPromise = client
      .startClientLogin(clientId!, clientSecret!)
      .then(() => undefined)
      .catch((err) => {
        lastAuthError = err?.message;
        console.error("[medplum] client login failed, falling back to fixture:", err?.message);
        client = null;
        throw err;
      });
  }
  try {
    await authPromise;
    return client;
  } catch {
    authPromise = null;
    return null;
  }
}

/**
 * Chart cache, keyed BY PATIENT.
 *
 * This was previously a single process-global slot, which meant a second
 * patient's session would read the first patient's chart — a cross-patient data
 * leak, and the sort of defect that ends a pilot.
 */
/**
 * The cache stores the slice's ORIGIN alongside it, not just the bytes.
 *
 * Origin is a property of how the data was obtained, so it has to be cached
 * with the data. Recomputing it at read time from `medplumConfigured` asks a
 * question about configuration and reports the answer as a question about
 * provenance — which is how a fixture cached after a failed live read got
 * reported as live.
 */
const warmCache = new Map<string, { at: number; slice: ChartSlice; simulated: boolean }>();
const WARM_TTL_MS = 5 * 60_000;

/** Business key -> Medplum's real, server-assigned Patient id. */
const livePatientIdCache = new Map<string, string>();

export interface PatientIdResolution {
  /** The real, server-assigned Patient id. Null when resolution failed for any reason. */
  id: string | null;
  /** Why resolution failed. Present only when id is null. */
  reason?: string;
}

/**
 * Resolve the app's stable business key (e.g. PATIENT_ID) to the real Medplum
 * Patient id.
 *
 * Medplum does not support a client-chosen resource id, so the app's literal
 * "maria-delgado-synthetic" key can never BE the live Patient's id — it can
 * only be looked up by the identifier scripts/seedMaria.ts stamps onto the
 * seeded Patient.
 *
 * A read (warmChart) can safely fall back to the business key on failure —
 * an unmatched search is just an honestly empty chart. A write must not:
 * building a resource's subject/patient reference from the unresolved
 * business key would fabricate a link to a Patient id that doesn't exist.
 * The `reason` field exists so a write path can refuse and say why, instead
 * of silently degrading.
 */
export async function resolveLivePatientId(patientId: string): Promise<PatientIdResolution> {
  const cached = livePatientIdCache.get(patientId);
  if (cached) return { id: cached };
  const c = await getClient();
  if (!c) return { id: null, reason: lastAuthError ?? "medplum client unavailable" };
  try {
    const found = await c.searchOne("Patient", `identifier=${FIXTURE_IDENTIFIER_SYSTEM}|${patientId}`);
    if (!found?.id) {
      return { id: null, reason: `no live Patient found with identifier ${FIXTURE_IDENTIFIER_SYSTEM}|${patientId}` };
    }
    livePatientIdCache.set(patientId, found.id);
    return { id: found.id };
  } catch (err) {
    return { id: null, reason: (err as Error)?.message ?? String(err) };
  }
}

/**
 * Pre-warm the patient's chart slice.
 *
 * This is the single most important performance decision in the product: reads
 * that happen mid-conversation must not pay a network round trip, because a
 * felt pause on a voice call is what kills the illusion of a conversation.
 */
export async function warmChart(patientId: string = PATIENT_ID): Promise<Timed<ChartSlice>> {
  const t0 = performance.now();
  const c = await getClient();

  if (!c) {
    assertFixtureAllowed("Medplum", "no credentials configured");
    const slice = chartSlice();
    warmCache.set(patientId, { at: Date.now(), slice, simulated: true });
    return { data: slice, ms: Math.round(performance.now() - t0), simulated: true };
  }

  try {
    const livePatientId = (await resolveLivePatientId(patientId)).id ?? patientId;
    const [meds, conds, allergies] = await Promise.all([
      c.searchResources("MedicationRequest", { patient: livePatientId, status: "active" }),
      c.searchResources("Condition", { patient: livePatientId }),
      c.searchResources("AllergyIntolerance", { patient: livePatientId }),
    ]);

    /**
     * A live read returns what the chart actually holds — including nothing.
     *
     * This previously spread the fixture and backfilled any empty array from it
     * while still reporting `simulated: false`, so a patient with no recorded
     * medications would have been shown someone else's drug list labeled live.
     * An empty chart is a legitimate clinical answer and must be reported as
     * empty.
     */
    const empty = emptyChartSlice(patientId);
    const slice: ChartSlice = {
      ...empty,
      medications: meds.length
        ? meds.map((m) => {
            const authored = (m as { authoredOn?: string }).authoredOn;
            const cc = (m as { medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] } })
              .medicationCodeableConcept;
            return {
              id: m.id ?? "",
              name: cc?.coding?.[0]?.display ?? cc?.text ?? "unknown",
              text: cc?.text ?? "",
              startedDaysAgo: authored ? calendarDaysAgo(authored) : 0,
              dosage:
                (m as { dosageInstruction?: { text?: string }[] }).dosageInstruction?.[0]?.text ?? "",
              prescriber: (m as { requester?: { display?: string } }).requester?.display ?? "",
              status: (m as { status?: string }).status ?? "active",
            };
          })
        : [],
      conditions: conds.length
        ? conds.map((x: { id?: string; code?: { text?: string } }) => ({ id: x.id ?? "", text: x.code?.text ?? "" }))
        : [],
      allergies: allergies.length
        ? allergies.map((x: { id?: string; code?: { text?: string } }) => ({ id: x.id ?? "", text: x.code?.text ?? "" }))
        : [],
    };

    warmCache.set(patientId, { at: Date.now(), slice, simulated: false });
    return { data: slice, ms: Math.round(performance.now() - t0), simulated: false };
  } catch (err) {
    const detail = (err as Error)?.message;
    console.error("[medplum] warm failed:", detail);
    // Pilot mode surfaces the failure rather than substituting synthetic data.
    assertFixtureAllowed("Medplum", detail);
    const slice = chartSlice();
    warmCache.set(patientId, { at: Date.now(), slice, simulated: true });
    return { data: slice, ms: Math.round(performance.now() - t0), simulated: true };
  }
}

/**
 * Read the warmed slice. This is what runs inside the conversation turn.
 * It must be effectively instant — no network, no await on I/O.
 */
export function readChart(patientId: string = PATIENT_ID): Timed<ChartSlice> {
  const t0 = performance.now();
  const hit = warmCache.get(patientId);
  if (hit && Date.now() - hit.at < WARM_TTL_MS) {
    return {
      data: hit.slice,
      ms: Math.round((performance.now() - t0) * 100) / 100,
      // The cached origin, never a re-derivation from configuration.
      simulated: hit.simulated,
    };
  }
  assertFixtureAllowed("Medplum", `no warmed chart for ${patientId}`);
  const slice = chartSlice();
  warmCache.set(patientId, { at: Date.now(), slice, simulated: true });
  return { data: slice, ms: Math.round((performance.now() - t0) * 100) / 100, simulated: true };
}

/**
 * Move a Composition from preliminary to final.
 *
 * This is the ONLY function permitted to write a final clinical status, and it
 * is reachable only from the approval transaction. It deliberately does not
 * accept an arbitrary status.
 */
export async function finalizeComposition(
  compositionId: string,
  attesterName: string,
  at: string
): Promise<{ ok: boolean; error?: string }> {
  const c = await getClient();
  if (!c) return { ok: false, error: "medplum not configured" };
  try {
    const existing = (await c.readResource("Composition", compositionId)) as Record<string, unknown>;
    await c.updateResource({
      ...existing,
      status: "final",
      attester: [{ mode: "legal", time: at, party: { display: attesterName } }],
    } as Parameters<typeof c.updateResource>[0]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Outcome of persisting a single resource. Never claims an id for a write that did not happen. */
export interface ResourceWriteResult {
  resourceType: string;
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Write draft resources. NEVER writes a final status — the approval handler owns
 * that transition, and nothing here may bypass it.
 *
 * Each resource is created independently (Promise.allSettled): one resource
 * failing FHIR validation must not fail resources that would otherwise have
 * persisted. Partial success is reported per-resource, never rounded up to a
 * single pass/fail for the whole batch.
 */
export async function writeDraft(
  resources: Record<string, unknown>[]
): Promise<Timed<{ written: number; ids: string[]; results: ResourceWriteResult[] }>> {
  const t0 = performance.now();

  for (const r of resources) {
    if (r.status === "final" || r.status === "completed") {
      throw new Error(
        `writeDraft refused a resource with status="${String(r.status)}". ` +
          "Final status may only be set by the clinician approval handler."
      );
    }
  }

  const c = await getClient();
  if (!c) {
    return {
      data: {
        written: resources.length,
        ids: resources.map((r) => `local/${r.resourceType}`),
        results: resources.map((r) => ({
          resourceType: String(r.resourceType),
          ok: false,
          error: lastAuthError ?? "medplum client unavailable",
        })),
      },
      ms: Math.round(performance.now() - t0),
      simulated: true,
    };
  }

  const settled = await Promise.allSettled(
    resources.map((r) => c.createResource(r as Parameters<typeof c.createResource>[0]))
  );

  const results: ResourceWriteResult[] = settled.map((s, i) => {
    const resourceType = String(resources[i].resourceType);
    if (s.status === "fulfilled") {
      const created = s.value as { id?: string };
      return { resourceType, ok: true, id: created.id };
    }
    const message = (s.reason as Error)?.message ?? String(s.reason);
    console.error(`[medplum] write failed for ${resourceType}:`, message);
    return { resourceType, ok: false, error: message };
  });

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  return {
    data: {
      written: succeeded.length,
      ids: succeeded.map((r) => `${r.resourceType}/${r.id}`),
      results,
    },
    ms: Math.round(performance.now() - t0),
    simulated: false,
    detail: failed.length ? failed.map((r) => `${r.resourceType}: ${r.error}`).join("; ") : undefined,
  };
}
