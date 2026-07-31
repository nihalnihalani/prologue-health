/**
 * Server-authoritative intake session store.
 *
 * The store now holds an `IntakeSession` — patient-keyed, with an explicit
 * lifecycle and a signature record — rather than a bare StoryMap. The clinical
 * payload is one field of it. This is what makes the approval transaction
 * server-authoritative: there is a canonical copy on the server to reload.
 *
 * Scope, stated honestly: this is still an in-process Map. It crosses devices
 * against a single server instance and survives reloads, but not a restart and
 * not multiple serverless instances. Durable persistence is Phase 2; the
 * interface here is deliberately narrow so swapping the backing store does not
 * touch the transaction logic.
 */

import type { StoryMap } from "./types";
import type { IntakeSession, IntakeState } from "./intake";
import { canTransition, InvalidTransitionError } from "./intake";

interface Entry {
  session: IntakeSession;
  /** Monotonic tiebreaker: Date.now() ties within a millisecond. */
  seq: number;
}

const globalForStore = globalThis as unknown as {
  __prologueStore?: Map<string, Entry>;
  __prologueSeq?: { n: number };
};
const store: Map<string, Entry> = globalForStore.__prologueStore ?? new Map();
globalForStore.__prologueStore = store;
const counter = globalForStore.__prologueSeq ?? { n: 0 };
globalForStore.__prologueSeq = counter;

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 200;

function sweep() {
  const now = Date.now();
  for (const [id, e] of store) {
    // A signed session is a clinical record; never sweep it on a timer.
    if (e.session.state === "signed") continue;
    if (now - new Date(e.session.updatedAt).getTime() > TTL_MS) store.delete(id);
  }
  if (store.size > MAX_SESSIONS) {
    const oldest = [...store.entries()]
      .filter(([, e]) => e.session.state !== "signed")
      .sort((a, b) => a[1].seq - b[1].seq);
    for (const [id] of oldest.slice(0, store.size - MAX_SESSIONS)) store.delete(id);
  }
}

/** Create or update a session from a client-supplied StoryMap. */
export function upsertFromMap(
  map: StoryMap,
  opts: { patientId: string; appointmentId?: string }
): IntakeSession {
  sweep();
  const now = new Date().toISOString();
  const existing = store.get(map.sessionId)?.session;

  // A signed session is terminal. Late client writes are ignored, not applied —
  // otherwise a stale tab could mutate an attested record.
  if (existing?.state === "signed") return existing;

  const state: IntakeState = deriveState(map, existing?.state);

  // Sanitise the clinical payload. The client may not assert finality — not via
  // the lifecycle state, and not via the StoryMap either. The UI reads
  // compositionStatus for its status pill, so leaving a client-supplied "final"
  // in place would let a stale or hostile tab display an attestation that never
  // happened. Only approveIntake() may set these.
  const clean: StoryMap =
    map.compositionStatus === "final" || map.approvedBy || map.approvedAt
      ? { ...map, compositionStatus: "preliminary", approvedBy: undefined, approvedAt: undefined }
      : map;
  const session: IntakeSession = existing
    ? { ...existing, map: clean, state, locale: map.locale, updatedAt: now }
    : {
        id: map.sessionId,
        patientId: opts.patientId,
        appointmentId: opts.appointmentId,
        state,
        locale: map.locale,
        map: clean,
        createdAt: now,
        updatedAt: now,
      };

  store.set(session.id, { session, seq: ++counter.n });
  return session;
}

/** Lifecycle is derived from observable facts, never taken from the client. */
function deriveState(map: StoryMap, current?: IntakeState): IntakeState {
  if (current === "signed") return "signed";
  if (current === "under_review") return "under_review";
  if (!map.consent.granted) return "created";
  // A session with a spoken summary or an escalation is ready for a clinician.
  if (map.escalation || map.openQuestions.some((q) => q.kind === "doorknob")) {
    return "ready_for_review";
  }
  if (map.items.length > 0) return "in_progress";
  return "consented";
}

export function getSession(id: string): IntakeSession | null {
  return store.get(id)?.session ?? null;
}

export function putSession(session: IntakeSession): IntakeSession {
  store.set(session.id, { session, seq: ++counter.n });
  return session;
}

/** Move a session through the lifecycle, refusing illegal transitions. */
export function transition(id: string, to: IntakeState): IntakeSession {
  const e = store.get(id);
  if (!e) throw new Error(`unknown session: ${id}`);
  if (!canTransition(e.session.state, to)) {
    throw new InvalidTransitionError(e.session.state, to);
  }
  e.session.state = to;
  e.session.updatedAt = new Date().toISOString();
  e.seq = ++counter.n;
  return e.session;
}

export function latestSession(): IntakeSession | null {
  sweep();
  let best: Entry | null = null;
  for (const e of store.values()) if (!best || e.seq > best.seq) best = e;
  return best?.session ?? null;
}

/** The clinician work queue. Escalations first, then most recently updated. */
export function listSessions(opts?: { patientId?: string }): IntakeSession[] {
  sweep();
  return [...store.values()]
    .map((e) => e.session)
    .filter((s) => (opts?.patientId ? s.patientId === opts.patientId : true))
    .sort((a, b) => {
      const urgency = (s: IntakeSession) =>
        s.state === "signed" ? -1 : s.map.escalation?.severity === "high" ? 2 : s.map.escalation ? 1 : 0;
      const d = urgency(b) - urgency(a);
      return d !== 0 ? d : b.updatedAt.localeCompare(a.updatedAt);
    });
}

/** Test seam. */
export function __clear() {
  store.clear();
}
