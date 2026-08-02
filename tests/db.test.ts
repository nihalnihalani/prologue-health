/**
 * Durable control-plane tests, run against a REAL PostgreSQL.
 *
 * These assertions are about guarantees an in-process Map cannot make:
 * cross-tenant isolation, concurrent-claim safety, append-only transcripts,
 * and idempotent external writes that survive a restart. Verifying them
 * against a fake would prove nothing, because the guarantees are the
 * database's, so this suite skips rather than pretends when no DATABASE_URL
 * is present.
 *
 *   docker run -d --name prologue-pg -e POSTGRES_PASSWORD=prologue \
 *     -e POSTGRES_USER=prologue -e POSTGRES_DB=prologue_test \
 *     -p 55432:5432 postgres:16-alpine
 *   DATABASE_SSL=disable \
 *   DATABASE_URL=postgres://prologue:prologue@localhost:55432/prologue_test npm test
 */

import { test, describe, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";

const HAVE_DB = Boolean(process.env.DATABASE_URL);
const d = HAVE_DB ? describe : describe.skip;

d("durable control plane", () => {
  let db: typeof import("../lib/db/sessions");
  let client: typeof import("../lib/db/client");
  let tenantA = "";
  let tenantB = "";
  let clinician = "";

  beforeAll(async () => {
    client = await import("../lib/db/client");
    db = await import("../lib/db/sessions");
    await client.migrate();

    const pool = client.getPool();
    // Fresh, isolated tenants per run: these tests must not depend on, or
    // disturb, anything already in the database.
    const a = await pool.query(
      "INSERT INTO tenants (slug, name) VALUES ($1,$1) RETURNING id",
      [`clinic-a-${Date.now()}`]
    );
    const b = await pool.query(
      "INSERT INTO tenants (slug, name) VALUES ($1,$1) RETURNING id",
      [`clinic-b-${Date.now()}`]
    );
    tenantA = a.rows[0].id;
    tenantB = b.rows[0].id;
    const c = await pool.query(
      "INSERT INTO actors (tenant_id, subject, role) VALUES ($1,'dr-reyes','clinician') RETURNING id",
      [tenantA]
    );
    clinician = c.rows[0].id;
  });

  afterAll(async () => {
    await client.closePool();
  });

  test("migrations are idempotent — re-running applies nothing", async () => {
    const ran = await client.migrate();
    assert.deepEqual(ran, [], "a second migrate() must be a no-op");
  });

  test("ISOLATION: a session is invisible to another tenant", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a1" });
    assert.ok(await db.getSession(tenantA, s.id), "owning tenant can read it");
    assert.equal(
      await db.getSession(tenantB, s.id),
      null,
      "a second clinic must not read another clinic's session even with the exact id"
    );
    const queueB = await db.listQueue(tenantB);
    assert.ok(!queueB.some((q) => q.id === s.id), "and it must not appear in their queue");
  });

  test("CONCURRENCY: only one of two racing claims wins", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a2" });
    const ready = await db.transition(tenantA, s.id, s.version, "ready_for_review");

    // Both clinicians read the same version, then both try to claim it.
    const results = await Promise.allSettled([
      db.claim(tenantA, s.id, ready.version, clinician),
      db.claim(tenantA, s.id, ready.version, clinician),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    assert.equal(won.length, 1, "exactly one claim may succeed");
    assert.equal(lost.length, 1, "the loser must be told, not silently share the case");
    assert.equal((lost[0] as PromiseRejectedResult).reason.name, "VersionConflictError");
  });

  test("a stale version cannot overwrite a newer decision", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a3" });
    await db.transition(tenantA, s.id, s.version, "consented");
    await assert.rejects(
      () => db.transition(tenantA, s.id, s.version, "abandoned"),
      (e: Error) => e.name === "VersionConflictError"
    );
  });

  test("turns are append-only and sequentially numbered", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a4" });
    const t1 = await db.appendTurn({
      tenantId: tenantA, sessionId: s.id, speaker: "patient", text: "I have a rash",
    });
    const t2 = await db.appendTurn({
      tenantId: tenantA, sessionId: s.id, speaker: "agent", text: "How long?",
    });
    assert.equal(t1.seq, 1);
    assert.equal(t2.seq, 2);
    const turns = await db.listTurns(tenantA, s.id);
    assert.equal(turns.length, 2);
  });

  test("IDEMPOTENCY: a redelivered provider transcript does not duplicate a turn", async () => {
    // Deepgram redelivers final transcripts on reconnect. A second turn would
    // fork the provenance of every fact extracted from it.
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a5" });
    const first = await db.appendTurn({
      tenantId: tenantA, sessionId: s.id, speaker: "patient",
      text: "my mouth is sore", provider: "deepgram", providerEventId: "evt-1",
    });
    const replay = await db.appendTurn({
      tenantId: tenantA, sessionId: s.id, speaker: "patient",
      text: "my mouth is sore", provider: "deepgram", providerEventId: "evt-1",
    });
    assert.equal(replay.duplicate, true, "the replay must be recognised");
    assert.equal(replay.id, first.id, "and must resolve to the original turn");
    assert.equal((await db.listTurns(tenantA, s.id)).length, 1);
  });

  test("a negative rule evaluation is stored, so 'not screened' survives", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a6", locale: "es" });
    await db.recordRuleEvaluation({
      tenantId: tenantA, sessionId: s.id, fired: false, locale: "es",
      covered: false, detail: "Spanish intake: English-only rules did not run",
    });
    const { rows } = await client.getPool().query(
      "SELECT fired, covered FROM rule_evaluations WHERE session_id = $1",
      [s.id]
    );
    assert.equal(rows.length, 1, "the absence of a finding is itself a record");
    assert.equal(rows[0].fired, false);
    assert.equal(rows[0].covered, false, "uncovered must be distinguishable from clean");
  });

  test("IDEMPOTENCY: the same write is enqueued once across a simulated restart", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a7" });
    const key = `sign:${s.id}:Composition`;
    const first = await db.enqueueWrite({
      tenantId: tenantA, sessionId: s.id, idempotencyKey: key,
      resourceType: "Composition", payload: { status: "preliminary" },
    });
    // Same command replayed after a crash: must not create a second FHIR write.
    const second = await db.enqueueWrite({
      tenantId: tenantA, sessionId: s.id, idempotencyKey: key,
      resourceType: "Composition", payload: { status: "preliminary" },
    });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.id, first.id);
  });

  test("two instances draining the outbox never take the same row", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a8" });
    await db.enqueueWrite({
      tenantId: tenantA, sessionId: s.id, idempotencyKey: `k-${s.id}`,
      resourceType: "Observation", payload: {},
    });
    const [i1, i2] = await Promise.all([db.claimNextWrite(5), db.claimNextWrite(5)]);
    const ids = [...i1, ...i2].map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "SKIP LOCKED must prevent double delivery");
  });

  test("a receipt cannot claim success without a real resource id", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a9" });
    await assert.rejects(
      () =>
        client.getPool().query(
          `INSERT INTO write_receipts (tenant_id, session_id, resource_type, status)
           VALUES ($1,$2,'Composition','written')`,
          [tenantA, s.id]
        ),
      /written_has_id/,
      "a 'written' receipt with no id is a placeholder masquerading as a FHIR resource"
    );
  });

  test("a signed session cannot exist without an actor and a timestamp", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a10" });
    await assert.rejects(
      () =>
        client.getPool().query(
          "UPDATE intake_sessions SET state = 'signed' WHERE id = $1",
          [s.id]
        ),
      /signed_is_complete/,
      "finality must always carry attribution"
    );
  });

  test("an edit decision must carry the edited text", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a11" });
    await assert.rejects(
      () =>
        db.recordDecision({
          tenantId: tenantA, sessionId: s.id, itemKey: "item-1",
          kind: "edit", actorId: clinician, reviewVersion: s.version,
        }),
      /edit_has_text/
    );
  });

  test("decisions are explicit and one-per-item; a change replaces, not duplicates", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a12" });
    await db.recordDecision({
      tenantId: tenantA, sessionId: s.id, itemKey: "corr-1",
      kind: "reject", actorId: clinician, reviewVersion: s.version,
    });
    await db.recordDecision({
      tenantId: tenantA, sessionId: s.id, itemKey: "corr-1",
      kind: "approve", actorId: clinician, reviewVersion: s.version,
    });
    const rows = await db.listDecisions(tenantA, s.id);
    assert.equal(rows.length, 1, "no competing decision rows for one item");
    assert.equal(rows[0].kind, "approve");
  });

  test("the queue puts escalated cases first — the rail depends on this order", async () => {
    // The clinician rail renders this order directly, so ordering is a product
    // guarantee rather than a presentation detail: a flagged case must not sit
    // below routine ones just because it arrived earlier.
    const calm = await db.createSession({ tenantId: tenantA, patientRef: "Patient/q-calm" });
    await db.transition(tenantA, calm.id, calm.version, "ready_for_review");

    const flagged = await db.createSession({ tenantId: tenantA, patientRef: "Patient/q-flagged" });
    await db.transition(tenantA, flagged.id, flagged.version, "ready_for_review");
    await db.recordRuleEvaluation({
      tenantId: tenantA, sessionId: flagged.id, ruleId: "mucosal-involvement",
      fired: true, severity: "high", locale: "en", covered: true,
    });

    const q = await db.listQueue(tenantA);
    const iFlagged = q.findIndex((r) => r.id === flagged.id);
    const iCalm = q.findIndex((r) => r.id === calm.id);
    assert.ok(iFlagged >= 0 && iCalm >= 0, "both cases must appear in the queue");
    assert.ok(iFlagged < iCalm, "an escalated case must rank above a routine one");
    assert.equal(q[iFlagged].escalated, true);
    assert.equal(q[iCalm].escalated, false);
  });

  test("audit history is tenant-scoped and ordered", async () => {
    const s = await db.createSession({ tenantId: tenantA, patientRef: "Patient/a13" });
    await db.recordAudit({
      tenantId: tenantA, sessionId: s.id, action: "session.read",
      actorSubject: "dr-reyes", outcome: "success",
    });
    assert.equal((await db.auditHistory(tenantA, s.id)).length, 1);
    assert.equal(
      (await db.auditHistory(tenantB, s.id)).length,
      0,
      "another clinic must not read this audit trail"
    );
  });
});
