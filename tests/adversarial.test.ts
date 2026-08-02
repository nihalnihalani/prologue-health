/**
 * Adversarial trust tests.
 *
 * Each of these encodes a mismatch found by auditing visible claims against
 * running code. They exist so the claim and the behaviour cannot drift apart
 * again.
 */

import { test, afterEach, vi } from "vitest";
import assert from "node:assert/strict";

import { checkRedFlags, safetyCoverage, isSuppressed, SAFETY_RULE_LOCALES } from "../lib/clinical";
import { PrologueSession } from "../lib/session";
import { chartSlice, emptyChartSlice } from "../lib/fixtures";
import { checkEligibility } from "../lib/stedi";
import { warmChart, readChart } from "../lib/medplum";
import { IntegrationUnavailableError } from "../lib/runtime";

afterEach(() => {
  delete process.env.PROLOGUE_MODE;
});

/* ---------------- negation and history ---------------- */

test("ADVERSARIAL: negated symptoms do not escalate", () => {
  for (const p of [
    "my mouth is not sore",
    "no blistering at all",
    "denies any trouble breathing",
    "there is no fever",
    "she hasn't had any blistering",
  ]) {
    assert.equal(checkRedFlags(p), null, `must not escalate on: "${p}"`);
  }
});

test("ADVERSARIAL: historical symptoms do not escalate", () => {
  for (const p of [
    "I had a sore mouth last year but it went away",
    "history of blistering, resolved months ago",
    "I used to get trouble breathing, not any more",
  ]) {
    assert.equal(checkRedFlags(p), null, `must not escalate on: "${p}"`);
  }
});

test("ADVERSARIAL: a real report inside a mixed sentence still escalates", () => {
  // Negation in one clause must not mask a genuine report in another.
  const e = checkRedFlags("no fever, but my mouth is sore");
  assert.ok(e, "a true finding beside a negated one must still fire");
  assert.equal(e!.ruleId, "mucosal-involvement");
});

test("ADVERSARIAL: suppression is conservative — ambiguity still escalates", () => {
  assert.equal(isSuppressed("my mouth is sore"), false);
  // "not sure" is hedging, not negation of the finding; it must still fire.
  const e = checkRedFlags("I'm not sure but my lips are blistered");
  assert.ok(e, "hedged language must not silence a finding");
});

/* ---------------- multilingual safety coverage ---------------- */

test("ADVERSARIAL: safety rules are English-only and say so", () => {
  assert.deepEqual([...SAFETY_RULE_LOCALES], ["en"]);
  assert.equal(safetyCoverage("en").covered, true);
  assert.equal(safetyCoverage("es").covered, false);
  assert.match(safetyCoverage("es").note!, /NOT automatically screened/);
});

test("ADVERSARIAL: a non-English intake records the coverage gap for the clinician", () => {
  const s = new PrologueSession("es-gap", "es");
  s.attachChart(chartSlice(), 1, true);
  s.patientSaid("me duele mucho la boca", 60);

  assert.equal(s.map.safetyCoverage?.covered, false);
  const gap = s.map.items.find((i) => i.rule === "safety-coverage-unavailable");
  assert.ok(gap, "the clinician must be told the transcript was not screened");
  assert.equal(gap!.patientText, undefined, "not a patient-facing message");
  assert.match(gap!.text, /English only/);
});

test("ADVERSARIAL: an English intake records positive coverage and no gap item", () => {
  const s = new PrologueSession("en-cov", "en");
  s.attachChart(chartSlice(), 1, true);
  s.patientSaid("rash on both arms, four days", 60);
  assert.equal(s.map.safetyCoverage?.covered, true);
  assert.ok(!s.map.items.some((i) => i.rule === "safety-coverage-unavailable"));
});

/* ---------------- fixture / live labelling ---------------- */

test("ADVERSARIAL: an empty live chart is empty, not the demo patient's drugs", () => {
  const empty = emptyChartSlice("some-other-patient");
  assert.equal(empty.medications.length, 0, "no synthetic medications may appear");
  assert.equal(empty.conditions.length, 0);
  assert.equal(empty.allergies.length, 0);
  assert.equal(empty.patient.id, "some-other-patient");
  // The fixture patient's drugs must not leak in.
  assert.ok(!JSON.stringify(empty.medications).includes("lamotrigine"));
});

test("ADVERSARIAL: an unconfigured chart read is labelled simulated", async () => {
  const r = await warmChart("p-unconfigured");
  assert.equal(r.simulated, true, "with no credentials the result must say so");
});

test("ADVERSARIAL: a cached fixture is never re-labelled live on read", async () => {
  // The failure this pins: warmChart() caches the FIXTURE when a live read
  // fails, and readChart() used to recompute the label as `!medplumConfigured`.
  // With credentials present but the integration failing, that reported cached
  // synthetic data as live — the exact substitution the product forbids.
  // Origin must travel with the data, not be re-derived from configuration.
  const warmed = await warmChart("p-origin-cache");
  const read = readChart("p-origin-cache");
  assert.equal(
    read.simulated,
    warmed.simulated,
    "a cache hit must report the origin it was stored with"
  );
  assert.equal(read.simulated, true, "this slice came from the fixture, so it stays labelled simulated");
});

test("ADVERSARIAL: pilot mode refuses to serve a fixture chart", async () => {
  process.env.PROLOGUE_MODE = "pilot";
  await assert.rejects(() => warmChart("p-pilot"), IntegrationUnavailableError);
  assert.throws(() => readChart("p-never-warmed"), IntegrationUnavailableError);
});

test("ADVERSARIAL: an unconfigured eligibility check is labelled simulated", async () => {
  const r = await checkEligibility({
    firstName: "Maria", lastName: "Delgado", dateOfBirth: "19920314", memberId: "W1",
  });
  assert.equal(r.simulated, true);
  assert.equal(r.data.simulated, true, "the payload itself must carry the label");
});

/* ---------------- incomplete payer responses ---------------- */

test("ADVERSARIAL: a 271 missing benefits reports them missing, not backfilled", async () => {
  // Exercise the parser through a live-shaped response with no benefit segments.
  const { __parse271ForTest } = await import("../lib/stedi");
  const parsed = __parse271ForTest({ planStatus: [{ statusCode: "1" }], benefitsInformation: [] });

  assert.equal(parsed.simulated, false, "this is a live response");
  assert.deepEqual(parsed.copays, [], "no copay must mean no copay, not a fixture copay");
  assert.equal(parsed.coinsurancePercent, undefined);
  assert.equal(parsed.deductibleRemaining, undefined);
  assert.ok(parsed.missingFields?.includes("copay"), "the gap must be declared");
  assert.ok(parsed.missingFields?.includes("deductibleRemaining"));
  // The demo patient's numbers must never appear in a live result.
  assert.ok(!JSON.stringify(parsed).includes("1840"));
});

test("ADVERSARIAL: a partial 271 keeps what it got and flags only what it lacks", async () => {
  const { __parse271ForTest } = await import("../lib/stedi");
  const parsed = __parse271ForTest({
    planStatus: [{ statusCode: "1" }],
    benefitsInformation: [
      { code: "B", benefitAmount: "40", placeOfService: ["Office visit"] },
    ],
  });
  assert.deepEqual(parsed.copays, [{ placeOfService: "Office visit", amount: 40 }]);
  assert.ok(!parsed.missingFields?.includes("copay"));
  assert.ok(parsed.missingFields?.includes("coinsurance"), "still-missing fields are declared");
});

/* ---------------- boundary strings ---------------- */

test("ADVERSARIAL: no shipped string gives medication advice", async () => {
  const { LOCALE_KEYS, t } = await import("../lib/i18n");
  const forbidden =
    /don'?t take|do not take|stop taking|no tome|deje de tomar|不要.*服用|停止服用|ne prenez pas|не принимайте/i;
  const KEYS = [
    "consentBody", "opening", "askDrugTiming", "askDistribution", "askQuality",
    "askAssociated", "escalateGeneric", "escalateUrgent", "reconAck", "doorknob",
    "doorknobAck", "benefits", "handoff", "labelDraft",
  ];
  for (const locale of LOCALE_KEYS) {
    for (const key of KEYS) {
      const v = t(locale, key, { drug: "x", weeks: 3, plan: "P", remaining: 1, drugs: "y" });
      assert.doesNotMatch(v, forbidden, `${locale}.${key} contains medication advice: "${v}"`);
    }
  }
});

test("ADVERSARIAL: the pilot secret is never referenced from client code", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = `${dir}/${f}`;
      if (f === "node_modules" || f === ".next" || f === ".git") return [];
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
    });

  for (const file of [...walk("app"), ...walk("components")]) {
    const src = readFileSync(file, "utf8");
    if (!src.includes('"use client"')) continue;
    assert.ok(
      !src.includes("NEXT_PUBLIC_CLINICIAN_SECRET"),
      `${file}: a NEXT_PUBLIC_ secret ships to every browser and defeats the gate`
    );
    assert.ok(
      !src.includes("PROLOGUE_CLINICIAN_SECRET"),
      `${file}: the pilot secret must stay server-side`
    );
  }
});

test("ADVERSARIAL: the clinician UI does not claim to play recorded audio", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["components/StoryMap.tsx", "app/clinician/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      !/Hear what the patient said|click to hear/i.test(src),
      `${f}: no audio is captured, so it must not offer to play a recording`
    );
  }
});

/* ================================================================== */
/* Milestone 0 — trust gaps closed                                    */
/* ================================================================== */

test("M0: pilot mode refuses fixture eligibility on MISSING credentials", async () => {
  process.env.PROLOGUE_MODE = "pilot";
  await assert.rejects(
    () => checkEligibility({ firstName: "M", lastName: "D", dateOfBirth: "19920314", memberId: "W1" }),
    IntegrationUnavailableError,
    "a payer question must never be answered with synthetic money in pilot mode"
  );
});

test("M0: pilot mode refuses fixture eligibility on a FAILED request", async () => {
  process.env.PROLOGUE_MODE = "pilot";
  process.env.STEDI_API_KEY = "test-key";
  process.env.STEDI_ELIGIBILITY_URL = "http://127.0.0.1:1/nope"; // guaranteed connection failure
  // Re-import so the module reads the patched env. vi.resetModules() is the
  // supported way to do this; a `?bust=` query string is not a valid module
  // specifier and made the bundler warn on every run.
  vi.resetModules();
  const mod = await import("../lib/stedi");
  await assert.rejects(
    () => mod.checkEligibility({ firstName: "M", lastName: "D", dateOfBirth: "19920314", memberId: "W1" }),
    /Stedi is unavailable/,
    "a timeout or rejected request is an integration failure, not fixture money"
  );
  delete process.env.STEDI_API_KEY;
  delete process.env.STEDI_ELIGIBILITY_URL;
});

test("M0: demo mode still degrades, but carries the failure detail", async () => {
  process.env.STEDI_API_KEY = "test-key";
  process.env.STEDI_ELIGIBILITY_URL = "http://127.0.0.1:1/nope";
  vi.resetModules();
  const mod = await import("../lib/stedi");
  const r = await mod.checkEligibility({ firstName: "M", lastName: "D", dateOfBirth: "19920314", memberId: "W1" });
  assert.equal(r.simulated, true, "a failed live call must be labelled simulated");
  assert.ok(r.detail, "the reason for degradation must be recorded");
  delete process.env.STEDI_API_KEY;
  delete process.env.STEDI_ELIGIBILITY_URL;
});

test("M0: GET /api/session is side-effect free — claiming is explicit", async () => {
  const { PrologueSession: PS } = await import("../lib/session");
  const { upsertFromMap: up, getSession: get, transition: tr, __clear: clr } = await import("../lib/store");
  clr();
  const s = new PS("readonly", "en");
  s.attachChart(chartSlice(), 1, true);
  s.grantConsent();
  s.patientSaid("my mouth is sore", 60);
  up(s.map, { patientId: "p" });

  assert.equal(get("readonly")!.state, "ready_for_review");
  // Simulate repeated reads. None of them may claim the case.
  for (let i = 0; i < 5; i++) assert.equal(get("readonly")!.state, "ready_for_review");

  // Only a deliberate action transitions it.
  tr("readonly", "under_review");
  assert.equal(get("readonly")!.state, "under_review");
  clr();
});

test("M0: a receipt never carries a resource id for a write that did not happen", async () => {
  const { approveIntake: ai, promotableItems: pi } = await import("../lib/intake");
  const { upsertFromMap: up, transition: tr, __clear: clr } = await import("../lib/store");
  const { PrologueSession: PS } = await import("../lib/session");
  clr();
  const s = new PS("noid", "en");
  s.attachChart(chartSlice(), 1, true);
  s.grantConsent();
  s.patientSaid("rash four days", 60);
  s.patientSaid("my mouth is sore", 90);
  const session = up(s.map, { patientId: "p" });
  tr("noid", "under_review");

  const r = await ai(session, {
    sessionId: "noid",
    clinicianId: "practitioner-osei",
    decisions: pi(session.map).map((i) => ({ itemId: i.id, decision: "approve" as const })),
  });

  assert.equal(r.signature.fullyPersisted, false);
  assert.equal(r.signature.partial, false);
  for (const w of r.signature.writes) {
    assert.equal(w.status, "not-attempted", `${w.resourceType} should not be claimed`);
    assert.equal(w.id, undefined, `${w.resourceType} must have no id`);
    assert.ok(!JSON.stringify(w).includes("local/"), "no placeholder id may masquerade as a resource");
  }
  // Every expected resource type is still accounted for.
  const types = new Set(r.signature.writes.map((w) => w.resourceType));
  for (const t of ["Composition", "Provenance", "AuditEvent"]) {
    assert.ok(types.has(t), `${t} must appear in the receipt with an honest status`);
  }
  clr();
});

test("M0: the clinician UI makes no unconditional persistence claim", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/clinician/page.tsx", "utf8");
  assert.ok(
    !/Provenance \+ AuditEvent written/.test(src),
    "the UI must not assert a write it cannot verify"
  );
  // Every persistence statement must be driven by the server receipt.
  assert.ok(src.includes("receipt.writes"), "the receipt must render per-resource server results");
  assert.ok(src.includes("No durable FHIR write was attempted"), "a fixture signature must say so");
  assert.ok(src.includes("PARTIAL"), "partial success must be visible and described as recoverable");
});

test("M0: pilot mode makes browser finalization visibly unavailable", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/clinician/page.tsx", "utf8");
  assert.ok(
    src.includes('mode === "pilot"') && src.includes("roster authorization is demo-only"),
    "pilot mode must disable browser finalization and say why"
  );
});
