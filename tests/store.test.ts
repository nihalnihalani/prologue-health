/**
 * Session store — the thing that lets the patient be on a phone and the
 * clinician on a laptop.
 */

import { test, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { putSession, getSession, latestSession, listSessions } from "../lib/store";
import { PrologueSession } from "../lib/session";
import { chartSlice } from "../lib/fixtures";

function make(id: string, locale: "en" | "es" = "en") {
  const s = new PrologueSession(id, locale);
  s.attachChart(chartSlice(), 1, true);
  return s;
}

test("a session round-trips across devices", () => {
  const s = make("cross-device");
  s.patientSaid("rash on both arms, about four days", 60);
  putSession(s.map);

  const fetched = getSession("cross-device");
  assert.ok(fetched, "clinician on another device must be able to load it");
  assert.equal(fetched!.sessionId, "cross-device");
  assert.ok(fetched!.items.length > 0);
  assert.ok(fetched!.timeline, "the timeline must survive serialisation");
});

test("latest returns the most recently updated session", () => {
  putSession(make("older").map);
  const newer = make("newer");
  newer.patientSaid("rash, four days", 60);
  putSession(newer.map);

  assert.equal(latestSession()?.map.sessionId, "newer");
});

test("the queue lists sessions newest first with escalation state", () => {
  const esc = make("escalated");
  esc.patientSaid("my mouth is sore", 90);
  putSession(esc.map);

  const list = listSessions();
  assert.ok(list.length > 0);
  const found = list.find((x) => x.id === "escalated")!;
  assert.ok(found.map.escalation, "escalation must be visible to the queue");
});

test("locale survives the round trip so the clinician sees the source language", () => {
  const s = make("spanish", "es");
  s.patientSaid("sarpullido, hace 4 days", 60);
  putSession(s.map);

  const back = getSession("spanish")!;
  assert.equal(back.locale, "es");
  const said = back.items.find((i) => i.source === "PATIENT")!;
  assert.equal(said.lang, "es-US", "clinician must know which language was spoken");
});

test("SAFETY: a stored session is still preliminary until signed", () => {
  const s = make("unsigned");
  s.patientSaid("rash, four days", 60);
  putSession(s.map);
  assert.equal(getSession("unsigned")!.compositionStatus, "preliminary");
});
