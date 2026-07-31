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
import { DG_FUNCTIONS, DG_AUTH_SUBPROTOCOL, isEchoOfAgent } from "../lib/deepgram-live";
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

test("the JWT from /api/deepgram-token is offered as 'bearer', never 'token'", () => {
  // /api/deepgram-token returns `access_token` from POST /v1/auth/grant — a JWT.
  // Deepgram accepts "token" ONLY for a raw API key. Verified against the live
  // endpoint: ["bearer", jwt] handshakes and yields Welcome/SettingsApplied;
  // ["token", jwt] is dropped with close code 1006 and no error frame, so this
  // regression is invisible unless it is pinned here.
  assert.equal(DG_AUTH_SUBPROTOCOL, "bearer");
  assert.notEqual(DG_AUTH_SUBPROTOCOL, "token");
});

test("the eligibility tool forbids stating a total price", () => {
  const el = DG_FUNCTIONS.find((f) => f.name === "run_eligibility_check")!;
  assert.match(el.description, /does NOT return a total price/i);
});

test("echo of the agent's own speech is not accepted as a patient turn", () => {
  // Captured verbatim from a live session on laptop speakers: Prologue's own
  // chart-aware question came back through the microphone and Deepgram
  // transcribed it with role "user". Untreated, the agent answers itself and
  // the patient's real turn is lost — the symptom being "it isn't listening,
  // it just keeps talking".
  const agentSaid = [
    "That helps. One thing I want to check, and it may be nothing, your record " +
      "shows you started lamotrigine about three weeks ago.",
  ];
  assert.equal(
    isEchoOfAgent(
      "That helps. One thing I want to check, and it may be nothing, your record " +
        "shows you started lamotrigine about three weeks ago.",
      agentSaid
    ),
    true,
    "the agent's own line must never be recorded as something the patient said"
  );
});

test("echo suppression never swallows a real patient turn", () => {
  const agentSaid = ["Your record shows you started lamotrigine about three weeks ago."];
  // Genuine answers, including ones that share vocabulary with the question.
  for (const real of [
    "Yeah, my psychiatrist added it last month.",
    "I've got this rash on both arms and some on my chest.",
    "No.",
    "I stopped the furosemide months ago.",
  ]) {
    assert.equal(isEchoOfAgent(real, agentSaid), false, `must not suppress: "${real}"`);
  }
});
