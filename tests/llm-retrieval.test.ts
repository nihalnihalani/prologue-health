/**
 * Governed LLM contract and retrieval PHI gate.
 *
 * The grounding tests use groundFacts() directly rather than calling the
 * provider, because the guarantee being asserted is OURS: whatever the model
 * returns, an ungrounded fact must never reach a clinician. That has to hold
 * even when the provider is unreachable, so it is tested offline.
 */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { groundFacts, PROMPT_VERSION, DEFAULT_MODEL, EXTRACTED_FIELDS } from "../lib/llm";
import {
  assertRetrievalAllowed,
  projectChartToDocs,
  MossRetrievalProvider,
  RetrievalProhibitedError,
} from "../lib/retrieval";

describe("LLM grounding contract", () => {
  const turn = "I've got this rash on both arms and my mouth is sore";

  test("a fact supported by the turn survives", () => {
    const { facts, rejected } = groundFacts(
      [{ field: "symptom", value: "rash", span_start: 13, span_end: 17, confidence: 0.9, uncertain: false }],
      turn
    );
    assert.equal(facts.length, 1);
    assert.equal(rejected, 0);
  });

  test("HALLUCINATION: a fact absent from the turn is DISCARDED, not down-scored", () => {
    // The failure this prevents: a plausible invented symptom reaching a
    // clinician with a low confidence number attached. There is no score at
    // which an invented finding is acceptable.
    const { facts, rejected } = groundFacts(
      [{ field: "symptom", value: "chest pain", span_start: 0, span_end: 10, confidence: 0.99, uncertain: false }],
      turn
    );
    assert.equal(facts.length, 0, "an ungrounded fact must not survive at any confidence");
    assert.equal(rejected, 1);
  });

  test("an out-of-range span is rejected", () => {
    const { facts, rejected } = groundFacts(
      [{ field: "symptom", value: "rash", span_start: 500, span_end: 900, confidence: 1, uncertain: false }],
      turn
    );
    assert.equal(facts.length, 0);
    assert.equal(rejected, 1);
  });

  test("an empty value is rejected", () => {
    const { facts } = groundFacts(
      [{ field: "symptom", value: "   ", span_start: 0, span_end: 4, confidence: 1, uncertain: false }],
      turn
    );
    assert.equal(facts.length, 0);
  });

  test("confidence is clamped, never trusted raw", () => {
    const { facts } = groundFacts(
      [{ field: "symptom", value: "rash", span_start: 13, span_end: 17, confidence: 42, uncertain: false }],
      turn
    );
    assert.equal(facts[0].confidence, 1);
  });

  test("WRONG SPAN: a fact whose claimed span points at unrelated words is repaired, not trusted", () => {
    // The old behaviour accepted this outright because the value appeared
    // somewhere in the utterance — so a clinician clicking through to "the words
    // this came from" would have been shown the wrong words.
    const { facts, rejected } = groundFacts(
      // span 0-4 is "I've", which supports nothing.
      [{ field: "symptom", value: "rash", span_start: 0, span_end: 4, confidence: 0.9, uncertain: false }],
      turn
    );
    assert.equal(rejected, 0);
    assert.equal(facts.length, 1);
    assert.equal(
      turn.slice(facts[0].spanStart, facts[0].spanEnd).toLowerCase(),
      "rash",
      "the stored span must actually contain the stored value"
    );
  });

  test("an unknown field is rejected rather than cast through", () => {
    // Casting an arbitrary string to ExtractedField would put a category nothing
    // in the product understands into the database and the clinician view.
    const { facts, rejected } = groundFacts(
      [{ field: "diagnosis", value: "rash", span_start: 13, span_end: 17, confidence: 1, uncertain: false }],
      turn
    );
    assert.equal(facts.length, 0, "\"diagnosis\" is not a field this model may assign");
    assert.equal(rejected, 1);
  });

  test("every declared field is accepted", () => {
    for (const field of EXTRACTED_FIELDS) {
      const { facts } = groundFacts(
        [{ field, value: "rash", span_start: 13, span_end: 17, confidence: 1, uncertain: false }],
        turn
      );
      assert.equal(facts.length, 1, `${field} must be accepted`);
    }
  });

  test("the model and prompt are pinned, not aliased", () => {
    // A moving alias silently invalidates any evaluation run performed against it.
    assert.doesNotMatch(DEFAULT_MODEL, /latest/, "must not track a mutable alias");
    assert.ok(PROMPT_VERSION.length > 0, "prompt version is persisted with every fact");
  });
});

describe("retrieval PHI gate", () => {
  const synthetic = projectChartToDocs(
    { medications: [{ id: "m1", name: "lamotrigine", dosage: "25mg", startedDaysAgo: 34 }] },
    { tenant: "t1", patient: "p1", synthetic: true }
  );

  test("synthetic documents are permitted", () => {
    assert.doesNotThrow(() => assertRetrievalAllowed(synthetic));
    assert.equal(synthetic[0].metadata.synthetic, "true");
  });

  test("PHI GATE: real (non-synthetic) documents are refused", () => {
    // Moss uploads document text to InferEdge for server-side index building.
    // A real chart therefore cannot be indexed, and this is the guard.
    const real = projectChartToDocs(
      { conditions: [{ id: "c1", text: "Bipolar II disorder" }] },
      { tenant: "t1", patient: "p1", synthetic: false }
    );
    assert.throws(() => assertRetrievalAllowed(real), RetrievalProhibitedError);
  });

  test("PHI GATE: pilot mode refuses Moss even for synthetic data", () => {
    const prev = process.env.PROLOGUE_MODE;
    process.env.PROLOGUE_MODE = "pilot";
    try {
      assert.throws(() => assertRetrievalAllowed(synthetic), RetrievalProhibitedError);
    } finally {
      process.env.PROLOGUE_MODE = prev;
    }
  });

  test("an index name never contains a raw patient identifier", () => {
    for (const d of synthetic) {
      assert.doesNotMatch(d.id, /p1/, "patient scope belongs in filtered metadata, not the id");
      assert.equal(d.metadata.patient, "p1");
    }
  });

  test("SCOPE: a query with no tenant/patient is refused at runtime, not silently widened", async () => {
    const p = new MossRetrievalProvider();
    // The type forbids this; the cast simulates a JS caller or a bad refactor.
    await assert.rejects(
      () => p.query("idx", "rash", {} as unknown as Parameters<typeof p.query>[2]),
      RetrievalProhibitedError,
      "an unscoped retrieval query must be impossible, not merely post-filtered"
    );
  });

  test("unavailable retrieval is an explicit result, never a confident empty one", async () => {
    const p = new MossRetrievalProvider();
    const r = await p.query("idx", "rash", { tenant: "t1", patient: "p1" });
    assert.equal(r.facts.length, 0);
    assert.equal(r.origin, "failed", "must not be reported as a successful empty search");
    assert.ok(r.unavailableReason, "the reason must reach the caller so the claim can be dropped");
  });
});
