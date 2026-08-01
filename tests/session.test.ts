/**
 * Golden-path tests for the conversation engine.
 *
 * The key assertion is that the chart-conditioned question is COMPUTED: change
 * the chart and the question changes; remove the drug and the question is never
 * asked. That is the product, so it is the thing most worth pinning down.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import { PrologueSession, extractOnsetDays } from "../lib/session";
import { chartSlice } from "../lib/fixtures";
import type { ChartSlice } from "../lib/fixtures";

function session() {
  const s = new PrologueSession("test");
  s.attachChart(chartSlice(), 42, true);
  s.grantConsent();
  return s;
}

test("onset extraction handles natural speech", () => {
  assert.equal(extractOnsetDays("maybe four days?"), 4);
  assert.equal(extractOnsetDays("about a week"), 7);
  assert.equal(extractOnsetDays("a couple of days"), 2);
  assert.equal(extractOnsetDays("two months ago"), 60);
  assert.equal(extractOnsetDays("it's just itchy"), null);
});

test("GOLDEN: the chart produces the lamotrigine question", () => {
  const s = session();
  const r = s.patientSaid("It's on both arms and some on my chest. Itchy. Maybe four days?", 63);

  assert.match(r.agentSays, /lamotrigine/i, "agent must ask about the drug from the chart");
  assert.equal(r.escalated, false);

  const inferred = s.map.items.find((i) => i.source === "INFERRED")!;
  assert.ok(inferred, "an inference should be recorded");
  assert.match(inferred.rule!, /temporal-correlation/);
  assert.ok(inferred.citation?.url?.includes("accessdata.fda.gov"), "inference must be cited");

  assert.ok(s.map.timeline, "timeline should be built");
  const rash = s.map.timeline!.events.find((e) => e.critical)!;
  assert.equal(rash.day, 18);
});

test("GOLDEN: the question changes when the chart changes", () => {
  const chart: ChartSlice = chartSlice();
  // Swap lamotrigine for allopurinol, started 40 days ago.
  chart.medications = [
    { ...chart.medications[0], name: "allopurinol", text: "allopurinol 100 mg", startedDaysAgo: 40 },
  ];
  const s = new PrologueSession("t2");
  s.attachChart(chart, 40, true);
  const r = s.patientSaid("rash started about a week ago", 30);
  assert.match(r.agentSays, /allopurinol/i, "the question follows the record, not a script");
});

test("GOLDEN: no matching drug means the question is never asked", () => {
  const chart: ChartSlice = chartSlice();
  chart.medications = [
    { ...chart.medications[0], name: "atorvastatin", text: "atorvastatin 20 mg", startedDaysAgo: 400 },
  ];
  const s = new PrologueSession("t3");
  s.attachChart(chart, 40, true);
  const r = s.patientSaid("rash started about four days ago", 30);
  assert.doesNotMatch(r.agentSays, /atorvastatin/i);
  assert.equal(s.map.items.filter((i) => i.source === "INFERRED").length, 0, "no unfounded inference");
});

test("GOLDEN: onset outside the window does not fire", () => {
  const s = session();
  // Rash starting 21 days ago = day 1 of therapy, before the 14-day window opens.
  const r = s.patientSaid("the rash started about three weeks ago", 30);
  assert.doesNotMatch(r.agentSays, /lamotrigine/i);
});

test("GOLDEN: mucosal involvement escalates and abandons the script", () => {
  const s = session();
  s.patientSaid("rash on both arms, maybe four days", 63);
  const r = s.patientSaid("oh — my mouth's been sore too", 95);

  assert.equal(r.escalated, true);
  assert.ok(s.map.escalation);
  assert.equal(s.map.escalation!.ruleId, "mucosal-involvement");
  assert.doesNotMatch(r.agentSays, /stevens|syndrome|diagnos/i, "must not name a condition to the patient");
});

test("reconciliation separates prescribed from reported", () => {
  const s = session();
  s.reconcile(["lamotrigine", "divalproex"], ["furosemide"]);

  const rows = s.map.reconciliation;
  assert.equal(rows.length, 3);
  const disc = rows.find((r) => r.state === "discrepancy")!;
  assert.match(disc.drug, /furosemide/);
  assert.ok(s.map.openQuestions.some((q) => q.kind === "contradiction"));
});

test("doorknob concern is pinned first", () => {
  const s = session();
  s.map.openQuestions.push({ id: "x", kind: "unanswered", text: "something else" });
  s.addDoorknob("I've been really tired", 250);
  assert.equal(s.map.openQuestions[0].kind, "doorknob");
});

test("SAFETY: composition is preliminary until approve() is called", () => {
  const s = session();
  s.patientSaid("rash, four days", 60);
  assert.equal(s.map.compositionStatus, "preliminary");

  s.approve([], "Dr. Amara Osei");
  assert.equal(s.map.compositionStatus, "final");
  assert.ok(s.map.approvedAt);
  assert.equal(s.map.approvedBy, "Dr. Amara Osei");
});

test("SAFETY: rejected items stay rejected after approval", () => {
  const s = session();
  s.patientSaid("rash on arms, four days", 60);
  const inferred = s.map.items.find((i) => i.source === "INFERRED")!;
  s.approve([inferred.id], "Dr. Amara Osei");
  assert.equal(s.map.items.find((i) => i.id === inferred.id)!.status, "rejected");
  assert.ok(s.map.items.some((i) => i.status === "approved"));
});

test("benefits are recorded as benefits, never as a price", () => {
  const s = session();
  s.attachBenefits(
    {
      planName: "Aetna PPO",
      active: true,
      copays: [{ placeOfService: "Urgent care", amount: 75 }],
      coinsurancePercent: 20,
      deductibleRemaining: 1840,
      simulated: true,
    },
    412
  );
  const item = s.map.items.find((i) => i.source === "INSURANCE")!;
  assert.match(item.patientText!, /can'?t promise a final number/i);
  assert.doesNotMatch(item.patientText!, /this visit will cost|total will be/i);
});
