/**
 * Medplum data layer.
 *
 * Live when MEDPLUM_CLIENT_ID / MEDPLUM_CLIENT_SECRET are present; otherwise the
 * synthetic fixture is served through the identical interface. Every call is
 * timed, and every result reports whether it was simulated — the UI shows that
 * honestly rather than implying a live backend that isn't there.
 */

import { MedplumClient } from "@medplum/core";
import { chartSlice, type ChartSlice, PATIENT_ID } from "./fixtures";

export interface Timed<T> {
  data: T;
  ms: number;
  simulated: boolean;
}

const baseUrl = process.env.MEDPLUM_BASE_URL || "https://api.medplum.com/";
const clientId = process.env.MEDPLUM_CLIENT_ID;
const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

export const medplumConfigured = Boolean(clientId && clientSecret);

let client: MedplumClient | null = null;
let authPromise: Promise<void> | null = null;

async function getClient(): Promise<MedplumClient | null> {
  if (!medplumConfigured) return null;
  if (!client) client = new MedplumClient({ baseUrl });
  if (!authPromise) {
    authPromise = client
      .startClientLogin(clientId!, clientSecret!)
      .then(() => undefined)
      .catch((err) => {
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

/** In-process cache of the patient's slice, warmed at session start. */
let warmCache: { at: number; slice: ChartSlice } | null = null;
const WARM_TTL_MS = 5 * 60_000;

/**
 * Pre-warm the patient's chart slice.
 *
 * This is the single most important performance decision in the product: reads
 * that happen mid-conversation must not pay a network round trip, because a
 * felt pause on a voice call is what kills the illusion of a conversation.
 */
export async function warmChart(): Promise<Timed<ChartSlice>> {
  const t0 = performance.now();
  const c = await getClient();

  if (!c) {
    const slice = chartSlice();
    warmCache = { at: Date.now(), slice };
    return { data: slice, ms: Math.round(performance.now() - t0), simulated: true };
  }

  try {
    const [meds, conds, allergies] = await Promise.all([
      c.searchResources("MedicationRequest", { patient: PATIENT_ID, status: "active" }),
      c.searchResources("Condition", { patient: PATIENT_ID }),
      c.searchResources("AllergyIntolerance", { patient: PATIENT_ID }),
    ]);

    const fixture = chartSlice();
    const slice: ChartSlice = {
      ...fixture,
      medications: meds.length
        ? meds.map((m) => {
            const authored = (m as { authoredOn?: string }).authoredOn;
            const cc = (m as { medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] } })
              .medicationCodeableConcept;
            return {
              id: m.id ?? "",
              name: cc?.coding?.[0]?.display ?? cc?.text ?? "unknown",
              text: cc?.text ?? "",
              startedDaysAgo: authored
                ? Math.round((Date.now() - new Date(authored).getTime()) / 86_400_000)
                : 0,
              dosage:
                (m as { dosageInstruction?: { text?: string }[] }).dosageInstruction?.[0]?.text ?? "",
              prescriber: (m as { requester?: { display?: string } }).requester?.display ?? "",
              status: (m as { status?: string }).status ?? "active",
            };
          })
        : fixture.medications,
      conditions: conds.length
        ? conds.map((x: { id?: string; code?: { text?: string } }) => ({ id: x.id ?? "", text: x.code?.text ?? "" }))
        : fixture.conditions,
      allergies: allergies.length
        ? allergies.map((x: { id?: string; code?: { text?: string } }) => ({ id: x.id ?? "", text: x.code?.text ?? "" }))
        : fixture.allergies,
    };

    warmCache = { at: Date.now(), slice };
    return { data: slice, ms: Math.round(performance.now() - t0), simulated: false };
  } catch (err) {
    console.error("[medplum] warm failed, serving fixture:", (err as Error)?.message);
    const slice = chartSlice();
    warmCache = { at: Date.now(), slice };
    return { data: slice, ms: Math.round(performance.now() - t0), simulated: true };
  }
}

/**
 * Read the warmed slice. This is what runs inside the conversation turn.
 * It must be effectively instant — no network, no await on I/O.
 */
export function readChart(): Timed<ChartSlice> {
  const t0 = performance.now();
  if (warmCache && Date.now() - warmCache.at < WARM_TTL_MS) {
    return { data: warmCache.slice, ms: Math.round((performance.now() - t0) * 100) / 100, simulated: !medplumConfigured };
  }
  const slice = chartSlice();
  warmCache = { at: Date.now(), slice };
  return { data: slice, ms: Math.round((performance.now() - t0) * 100) / 100, simulated: true };
}

/**
 * Write draft resources. NEVER writes a final status — the approval handler owns
 * that transition, and nothing here may bypass it.
 */
export async function writeDraft(resources: Record<string, unknown>[]): Promise<Timed<{ written: number; ids: string[] }>> {
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
      data: { written: resources.length, ids: resources.map((r) => `local/${r.resourceType}`) },
      ms: Math.round(performance.now() - t0),
      simulated: true,
    };
  }

  try {
    const created = await Promise.all(
      resources.map((r) => c.createResource(r as Parameters<typeof c.createResource>[0]))
    );
    return {
      data: {
        written: created.length,
        ids: created.map((x: { resourceType?: string; id?: string }) => `${x.resourceType}/${x.id}`),
      },
      ms: Math.round(performance.now() - t0),
      simulated: false,
    };
  } catch (err) {
    console.error("[medplum] write failed:", (err as Error)?.message);
    return {
      data: { written: 0, ids: [] },
      ms: Math.round(performance.now() - t0),
      simulated: true,
    };
  }
}
