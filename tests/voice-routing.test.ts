/**
 * Voice transport routing and the Deepgram contract.
 *
 * The routing rule is a product decision, not an implementation detail:
 * English goes to Deepgram because drug-name accuracy is the biggest live risk,
 * and every other language goes to Gemini because only its native-audio models
 * detect and switch language on their own.
 */

import { test } from "vitest";
import assert from "node:assert/strict";
import { DG_FUNCTIONS } from "../lib/deepgram-live";
import { keyterms } from "../lib/fixtures";
import { LOCALE_KEYS } from "../lib/i18n";

// Mirrors pickMode() in app/patient/page.tsx.
function pickMode(locale: string, deepgram: boolean, gemini: boolean, browserSR = true) {
  if (locale === "en" && deepgram) return "deepgram";
  if (locale !== "en" && gemini) return "gemini";
  if (deepgram && locale === "en") return "deepgram";
  if (gemini) return "gemini";
  return browserSR ? "browser" : "scripted";
}

test("English prefers Deepgram for medical vocabulary", () => {
  assert.equal(pickMode("en", true, true), "deepgram");
});

test("non-English prefers Gemini for automatic language switching", () => {
  for (const l of LOCALE_KEYS.filter((x) => x !== "en")) {
    assert.equal(pickMode(l, true, true), "gemini", `${l} should route to Gemini`);
  }
});

test("falls back through Gemini, then browser mic, then script", () => {
  assert.equal(pickMode("en", false, true), "gemini");
  assert.equal(pickMode("en", false, false), "browser");
  assert.equal(pickMode("en", false, false, false), "scripted");
  assert.equal(pickMode("es", false, false), "browser");
});

test("keyterms cover the drug names the demo turns on", () => {
  const k = keyterms().map((x) => x.toLowerCase());
  for (const drug of ["lamotrigine", "divalproex sodium", "furosemide"]) {
    assert.ok(k.includes(drug), `keyterms must include ${drug}`);
  }
});

test("Deepgram function schemas are lowercase JSON-Schema, not Gemini's enum casing", () => {
  // Deepgram expects "object"/"string"; Gemini expects Type.OBJECT. Mixing them
  // silently breaks tool calling, so pin it.
  for (const fn of DG_FUNCTIONS) {
    assert.equal(fn.parameters.type, "object", `${fn.name}: wrong root type`);
    for (const [prop, schema] of Object.entries(fn.parameters.properties ?? {})) {
      const ty = (schema as { type: string }).type;
      assert.ok(
        ["string", "number", "boolean", "object", "array"].includes(ty),
        `${fn.name}.${prop}: "${ty}" is not lowercase JSON-Schema`
      );
    }
  }
});

test("the safety tool exists and is described so the model must obey it", () => {
  const rf = DG_FUNCTIONS.find((f) => f.name === "check_red_flags")!;
  assert.ok(rf, "check_red_flags must be declared");
  assert.match(rf.description, /every patient turn/i);
  assert.match(rf.description, /verbatim|stop the routine/i);
});

test("the eligibility tool forbids stating a total price", () => {
  const el = DG_FUNCTIONS.find((f) => f.name === "run_eligibility_check")!;
  assert.match(el.description, /does NOT return a total price/i);
});
