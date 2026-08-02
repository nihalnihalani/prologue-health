/**
 * Voice tool execution boundary.
 *
 * These tools read the chart, call the payer, and record clinical statements.
 * They used to run in the patient's browser, which is why one of them could
 * report a statement saved while saving nothing. The properties asserted here
 * are the reasons that route exists: an allow-list the model cannot escape, a
 * session check before any PHI touches the wire, deterministic safety supplying
 * the exact words to speak, and honest refusal when there is nowhere to save.
 */

import { test, describe, vi, beforeEach } from "vitest";
import assert from "node:assert/strict";

// No database: this pins the behaviour of the route when there is nowhere to
// persist, which is exactly the condition under which the old browser tool
// claimed success.
vi.mock("@/lib/db/client", () => ({
  databaseConfigured: false,
  getPool: () => { throw new Error("no database in this test"); },
}));

async function callTool(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/voice-tool/route");
  const res = await POST(
    new Request("http://localhost/api/voice-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

describe("voice tool boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  test("ALLOW-LIST: an invented tool name never reaches a handler", async () => {
    const { status, json } = await callTool({
      sessionId: "s1",
      name: "exfiltrate_chart",
      args: {},
    });
    assert.equal(status, 400);
    assert.equal(json.error, "unknown tool");
  });

  test("a tool call without a session is rejected", async () => {
    const { status } = await callTool({ name: "check_red_flags", args: { transcript: "hi" } });
    assert.equal(status, 400);
  });

  test("SAFETY: an escalation returns the exact words the agent must speak", async () => {
    // The model is not asked to decide, or to paraphrase. Deterministic safety
    // supplies the sentence and the agent prompt requires it verbatim.
    const { json } = await callTool({
      sessionId: "s2",
      name: "check_red_flags",
      args: { transcript: "my mouth is sore and I have a rash on both arms" },
      locale: "en",
    });
    assert.equal(json.escalate, true);
    assert.equal(json.rule, "mucosal-involvement");
    assert.equal(json.severity, "high");
    assert.ok(json.say_exactly, "the server must supply the spoken words");
  });

  test("SAFETY: a clean turn escalates nothing and still reports coverage", async () => {
    const { json } = await callTool({
      sessionId: "s3",
      name: "check_red_flags",
      args: { transcript: "just a mild headache" },
      locale: "en",
    });
    assert.equal(json.escalate, false);
    assert.equal(json.covered, true);
  });

  test("SAFETY: an unsupported locale reports NOT covered", async () => {
    const { json } = await callTool({
      sessionId: "s4",
      name: "check_red_flags",
      args: { transcript: "me duele la boca" },
      locale: "es",
    });
    assert.equal(json.covered, false, "Spanish is outside the validated rule set");
  });

  test("HONESTY: with nowhere to save, the tool says so instead of claiming success", async () => {
    // The bug this replaces returned {saved: true} unconditionally, telling the
    // model a clinical statement had been recorded when no record existed.
    const { json } = await callTool({
      sessionId: "s5",
      name: "save_confirmed_statement",
      args: { text: "the rash started four days ago", category: "symptom" },
    });
    assert.equal(json.saved, false, "never claim a save that did not happen");
    assert.match(String(json.reason), /not recorded/);
  });

  test("an empty statement is not recorded", async () => {
    const { json } = await callTool({
      sessionId: "s6",
      name: "save_confirmed_statement",
      args: { text: "   " },
    });
    assert.equal(json.saved, false);
  });
});
