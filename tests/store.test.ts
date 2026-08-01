/**
 * Session store — patient-keyed, lifecycle-aware, and the thing that lets the
 * patient be on a phone while the clinician is on a laptop.
 */

import { test, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { upsertFromMap, getSession, latestSession, listSessions, __clear } from "../lib/store";
import { PrologueSession } from "../lib/session";
import { chartSlice } from "../lib/fixtures";

beforeEach(() => __clear());

function make(id: string, locale: "en" | "es" = "en") {
  const s = new PrologueSession(id, locale);
  s.attachChart(chartSlice(), 1, true);
  s.grantConsent();
  return s;
}

test("a session round-trips across devices", () => {
  const s = make("cross-device");
  s.patientSaid("rash on both arms, about four days", 60);
  upsertFromMap(s.map, { patientId: "maria-delgado-synthetic" });

  const fetched = getSession("cross-device");
  assert.ok(fetched, "clinician on another device must be able to load it");
  assert.equal(fetched!.map.sessionId, "cross-device");
  assert.ok(fetched!.map.items.length > 0);
  assert.ok(fetched!.map.timeline, "the timeline must survive serialisation");
  assert.equal(fetched!.patientId, "maria-delgado-synthetic");
});

test("latest returns the most recently updated session", () => {
  upsertFromMap(make("older").map, { patientId: "p" });
  const newer = make("newer");
  newer.patientSaid("rash, four days", 60);
  upsertFromMap(newer.map, { patientId: "p" });
  assert.equal(latestSession()?.id, "newer");
});

test("the queue exposes escalation state and lifecycle", () => {
  const esc = make("escalated");
  esc.patientSaid("my mouth is sore", 90);
  upsertFromMap(esc.map, { patientId: "p" });

  const found = listSessions().find((x) => x.id === "escalated")!;
  assert.ok(found.map.escalation, "escalation must be visible to the queue");
  assert.equal(found.state, "ready_for_review");
});

test("locale survives so the clinician sees the source language", () => {
  const s = make("spanish", "es");
  s.patientSaid("sarpullido, hace 4 days", 60);
  upsertFromMap(s.map, { patientId: "p" });

  const back = getSession("spanish")!;
  assert.equal(back.locale, "es");
  const said = back.map.items.find((i) => i.source === "PATIENT")!;
  assert.equal(said.lang, "es-US", "clinician must know which language was spoken");
});

test("SAFETY: a stored session is preliminary until the server signs it", () => {
  const s = make("unsigned");
  s.patientSaid("rash, four days", 60);
  upsertFromMap(s.map, { patientId: "p" });
  const stored = getSession("unsigned")!;
  assert.equal(stored.map.compositionStatus, "preliminary");
  assert.notEqual(stored.state, "signed");
});
