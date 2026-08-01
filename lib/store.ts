/**
 * Server-side session store.
 *
 * Why this exists: the demo is a phone for the patient and a laptop for the
 * clinician. Sharing the story map through localStorage means both views must
 * be the same browser, which is precisely the setup the demo does NOT use.
 *
 * Scope, stated honestly: this is an in-process Map. It survives page reloads
 * and crosses devices against a single server instance, which covers a demo and
 * local development. It does NOT survive a restart or span multiple serverless
 * instances. The real answer is Medplum itself — the story map is already
 * FHIR-shaped — and that is the documented next step rather than something
 * pretended to be done.
 */

import type { StoryMap } from "./types";

interface Entry {
  map: StoryMap;
  updatedAt: number;
  /** Monotonic tiebreaker: Date.now() ties when two writes land in the same
   *  millisecond, which made "latest" arbitrary. */
  seq: number;
}

// Survive Next.js dev hot-reload, which re-evaluates modules.
const globalForStore = globalThis as unknown as {
  __prologueStore?: Map<string, Entry>;
  __prologueSeq?: { n: number };
};
const store: Map<string, Entry> = globalForStore.__prologueStore ?? new Map();
globalForStore.__prologueStore = store;
const counter = globalForStore.__prologueSeq ?? { n: 0 };
globalForStore.__prologueSeq = counter;

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_SESSIONS = 50;

function sweep() {
  const now = Date.now();
  for (const [id, e] of store) {
    if (now - e.updatedAt > TTL_MS) store.delete(id);
  }
  // Bound memory: drop the oldest if a demo day leaves a lot behind.
  if (store.size > MAX_SESSIONS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].seq - b[1].seq);
    for (const [id] of oldest.slice(0, store.size - MAX_SESSIONS)) store.delete(id);
  }
}

export function putSession(map: StoryMap): { id: string; updatedAt: number } {
  sweep();
  const updatedAt = Date.now();
  store.set(map.sessionId, { map, updatedAt, seq: ++counter.n });
  return { id: map.sessionId, updatedAt };
}

export function getSession(id: string): StoryMap | null {
  return store.get(id)?.map ?? null;
}

/** The clinician queue picks up the most recently updated session. */
export function latestSession(): { map: StoryMap; updatedAt: number } | null {
  sweep();
  let best: Entry | null = null;
  for (const e of store.values()) {
    if (!best || e.seq > best.seq) best = e;
  }
  return best ? { map: best.map, updatedAt: best.updatedAt } : null;
}

/** Everything waiting for review, newest first. */
export function listSessions(): { id: string; map: StoryMap; updatedAt: number }[] {
  sweep();
  return [...store.entries()]
    .map(([id, e]) => ({ id, map: e.map, updatedAt: e.updatedAt, seq: e.seq }))
    .sort((a, b) => b.seq - a.seq)
    .map(({ id, map, updatedAt }) => ({ id, map, updatedAt }));
}
