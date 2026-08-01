/**
 * Multilingual invariants.
 *
 * The rules that matter are not "does it translate" — they are:
 *   1. Every locale carries every key (a missing key must never reach a patient).
 *   2. The CLINICAL record stays English no matter what the patient speaks.
 *   3. No localized patient-facing string names a condition or promises a price.
 */

import { test } from "vitest";
import assert from "node:assert/strict";

import { t, LOCALE_KEYS, LOCALES, isRTL, systemInstruction, type Locale } from "../lib/i18n";
import { PrologueSession } from "../lib/session";
import { chartSlice } from "../lib/fixtures";

const KEYS = [
  "consentTitle", "consentBody", "consentAccept", "opening", "askDrugTiming",
  "askDistribution", "askQuality", "askAssociated", "escalateGeneric", "escalateUrgent",
  "reconAck", "doorknob", "doorknobAck", "benefits", "handoff",
  "labelHeard", "labelCoverage", "labelDraft", "srcPatient", "srcRecord",
];

test("every locale carries every key", () => {
  for (const locale of LOCALE_KEYS) {
    for (const key of KEYS) {
      const v = t(locale, key, { drug: "x", weeks: 3, plan: "P", remaining: 1, drugs: "y" });
      assert.ok(v && v.length > 0, `${locale}.${key} is empty`);
      assert.doesNotMatch(v, /\{[a-z]+\}/i, `${locale}.${key} has an unfilled placeholder: ${v}`);
    }
  }
});

test("ten languages are offered, Arabic is RTL", () => {
  assert.ok(LOCALE_KEYS.length >= 10);
  assert.equal(isRTL("ar"), true);
  assert.equal(isRTL("en"), false);
  for (const l of LOCALE_KEYS) {
    assert.ok(LOCALES[l].bcp47.includes("-"), `${l} needs a BCP-47 tag`);
    assert.ok(LOCALES[l].native.length > 0);
  }
});

test("unknown key falls back to English rather than leaking a key name", () => {
  const v = t("es", "opening");
  assert.ok(v.length > 0);
  assert.doesNotMatch(v, /^opening$/);
});

test("GOLDEN: the chart-conditioned question is asked in the patient's language", () => {
  const spanish = new PrologueSession("es-test", "es");
  spanish.attachChart(chartSlice(), 1, true);
  const r = spanish.patientSaid("Tengo un sarpullido. Empezó hace unos 4 days.", 60);

  assert.match(r.agentSays, /lamotrigine/i, "the drug name still comes from the chart");
  assert.match(r.agentSays, /expediente|semanas/i, "but the sentence is Spanish");
  assert.doesNotMatch(r.agentSays, /Your record shows/i);
});

test("SAFETY: the clinical record stays English whatever the patient speaks", () => {
  for (const locale of ["es", "zh", "ar", "hi"] as Locale[]) {
    const s = new PrologueSession(`t-${locale}`, locale);
    s.attachChart(chartSlice(), 1, true);
    s.patientSaid("rash, about 4 days", 60);

    // Target the correlation inference specifically: a non-English session also
    // carries a safety-coverage item, which is itself clinician-facing English.
    const inferred = s.map.items.find((i) => i.rule?.startsWith("temporal-correlation"));
    assert.ok(inferred, `${locale}: expected a correlation inference`);
    assert.match(
      inferred!.text,
      /Symptom onset falls on day/,
      `${locale}: clinician-facing text must remain English`
    );

    // And the coverage gap must be recorded for every non-English intake.
    assert.equal(s.map.safetyCoverage?.covered, false, `${locale}: coverage gap must be recorded`);
    const gap = s.map.items.find((i) => i.rule === "safety-coverage-unavailable")!;
    assert.ok(gap, `${locale}: coverage gap must be a visible item`);
    assert.equal(gap.patientText, undefined, "the coverage gap is for the clinician, not the patient");
  }
});

test("SAFETY: escalation reaches the patient in their language and names no condition", () => {
  for (const locale of LOCALE_KEYS) {
    const s = new PrologueSession(`esc-${locale}`, locale);
    s.attachChart(chartSlice(), 1, true);
    const r = s.patientSaid("my mouth is sore", 90);

    assert.equal(r.escalated, true, `${locale}: mucosal involvement must escalate`);
    assert.equal(t(locale, "escalateGeneric"), r.agentSays, `${locale}: not localized`);
    assert.doesNotMatch(
      r.agentSays,
      /stevens|johnson|sjs|toxic epidermal|s[íi]ndrome|syndrome|diagnos/i,
      `${locale}: patient message must not name a condition`
    );
  }
});

test("SAFETY: no localized benefits string promises a total price", () => {
  for (const locale of LOCALE_KEYS) {
    const v = t(locale, "benefits", { plan: "Aetna PPO", remaining: 1840 });
    assert.doesNotMatch(
      v,
      /will cost|total (will|is)|costará en total|总共费用/i,
      `${locale}: benefits string must not imply a total`
    );
  }
});

test("system instruction restates the clinical boundary in every language", () => {
  for (const locale of LOCALE_KEYS) {
    const si = systemInstruction(locale, "Active medications:\n  - lamotrigine");
    assert.match(si, /Never name a diagnosis/);
    assert.match(si, /Never advise starting, stopping, or changing a medication/);
    assert.match(si, /Never state or estimate a total cost/);
    assert.match(si, new RegExp(LOCALES[locale].label), `${locale}: language not steered`);
    assert.match(si, /lamotrigine/, "chart context must be injected");
  }
});
