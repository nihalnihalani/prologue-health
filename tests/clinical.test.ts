/**
 * Tests for the deterministic clinical logic.
 *
 * These cover the safety-critical paths: red-flag detection must fire on the
 * escalation cases and stay silent on benign input, correlation must reject a
 * symptom that predates the drug, and — most importantly — the write path must
 * REFUSE to set a final status.
 *
 * Run: npm test
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import { checkRedFlags, correlate, buildTimeline, findDrugRisk } from "../lib/clinical";
import {
  chartSlice,
  keyterms,
  LAMOTRIGINE_STARTED_DAYS_AGO,
  RASH_STARTED_DAYS_AGO,
} from "../lib/fixtures";
import { writeDraft } from "../lib/medplum";

/* ---------------- red flags ---------------- */

test("red flag: mucosal involvement escalates", () => {
  const e = checkRedFlags("the rash is itchy and my mouth has been sore too");
  assert.equal(e?.ruleId, "mucosal-involvement");
  assert.equal(e?.severity, "high");
});

test("red flag: blistering escalates", () => {
  assert.equal(checkRedFlags("there's some blistering on my arm")?.ruleId, "blistering-peeling");
});

test("red flag: breathing difficulty escalates", () => {
  assert.equal(checkRedFlags("I'm having trouble breathing")?.ruleId, "airway-breathing");
});

test("red flag: benign description does not escalate", () => {
  assert.equal(checkRedFlags("itchy rash on both arms and my chest, about four days"), null);
});

test("red flag: high severity outranks moderate", () => {
  const e = checkRedFlags("I have a fever and my mouth is sore");
  assert.equal(e?.severity, "high");
});

test("red flag: patient message never names a condition", () => {
  for (const transcript of ["my mouth is sore", "there is blistering", "I have a fever"]) {
    const e = checkRedFlags(transcript);
    assert.ok(e, "expected escalation");
    const forbidden = /stevens|johnson|sjs|ten\b|toxic epidermal|syndrome|diagnos/i;
    assert.ok(
      !forbidden.test(e!.patientMessage),
      `patient message must not name a condition: "${e!.patientMessage}"`
    );
  }
});

/* ---------------- correlation ---------------- */

test("correlation: lamotrigine rash lands inside the labeled window", () => {
  const c = correlate("lamotrigine", LAMOTRIGINE_STARTED_DAYS_AGO, RASH_STARTED_DAYS_AGO, [
    "divalproex sodium",
  ]);
  assert.ok(c);
  assert.equal(c!.onsetDayOfTherapy, 18);
  assert.equal(c!.insideWindow, true);
  assert.equal(c!.amplifiers.length, 1, "divalproex should register as a valproate amplifier");
  assert.match(c!.risk.citation.url ?? "", /accessdata\.fda\.gov/);
});

test("correlation: symptom predating the drug is rejected", () => {
  assert.equal(correlate("lamotrigine", 22, 25, []), null);
});

test("correlation: unknown drug yields nothing", () => {
  assert.equal(correlate("atorvastatin", 30, 5, []), null);
  assert.equal(findDrugRisk("atorvastatin"), undefined);
});

test("timeline: rash marker falls within the shaded window", () => {
  const c = correlate("lamotrigine", 22, 4, ["divalproex sodium"])!;
  const tl = buildTimeline(c, 22, 4, ["divalproex sodium"]);
  const rash = tl.events.find((e) => e.critical)!;
  const win = tl.meds.find((m) => m.riskWindow)!.riskWindow!;
  assert.ok(rash.day >= win.fromDay && rash.day <= win.toDay);
});

/* ---------------- fixtures ---------------- */

test("fixtures: chart slice has the three medications", () => {
  const s = chartSlice();
  assert.equal(s.medications.length, 3);
  const lam = s.medications.find((m) => m.name === "lamotrigine")!;
  assert.ok(Math.abs(lam.startedDaysAgo - LAMOTRIGINE_STARTED_DAYS_AGO) <= 1);
});

test("fixtures: keyterms include the drug names ASR must get right", () => {
  const k = keyterms().map((x) => x.toLowerCase());
  assert.ok(k.includes("lamotrigine"));
  assert.ok(k.some((x) => x.includes("divalproex")));
});

/* ---------------- the safety gate ---------------- */

test("SAFETY: writeDraft refuses a final status", async () => {
  await assert.rejects(
    () => writeDraft([{ resourceType: "Composition", status: "final" }]),
    /refused a resource with status="final"/,
    "final status must be unreachable outside the approval handler"
  );
});

test("SAFETY: writeDraft accepts preliminary", async () => {
  const r = await writeDraft([{ resourceType: "Observation", status: "preliminary" }]);
  assert.equal(r.data.written, 1);
});
