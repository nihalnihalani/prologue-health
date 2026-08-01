/**
 * The clinical authority boundary.
 *
 * Before this phase the browser declared finality: the clinician page set
 * compositionStatus="final" in client state, while the server only ever wrote a
 * preliminary Composition and returned a Provenance it never saved. These tests
 * exist to make that regression impossible.
 */

import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  approveIntake,
  authorizeClinician,
  canTransition,
  projectDrafts,
  buildComposition,
  NotAuthorizedError,
  UnknownItemsError,
  InvalidTransitionError,
  type IntakeSession,
} from "../lib/intake";
import { upsertFromMap, getSession, transition, listSessions, __clear } from "../lib/store";
import { PrologueSession } from "../lib/session";
import { chartSlice, calendarDaysAgo } from "../lib/fixtures";
import { writeDraft } from "../lib/medplum";
import { IntegrationUnavailableError, assertFixtureAllowed, runtimeMode } from "../lib/runtime";

function seed(id = "s1", opts: { escalate?: boolean } = {}): IntakeSession {
  const s = new PrologueSession(id, "en");
  s.attachChart(chartSlice(), 1, true);
  s.grantConsent();
  s.patientSaid("rash on both arms and chest, about four days", 60);
  if (opts.escalate) s.patientSaid("my mouth is sore too", 90);
  return upsertFromMap(s.map, { patientId: "maria-delgado-synthetic" });
}

beforeEach(() => __clear());
afterEach(() => {
  delete process.env.PROLOGUE_MODE;
  delete process.env.PROLOGUE_CLINICIAN_SECRET;
});

/* ---------------- lifecycle ---------------- */

test("lifecycle: signed is terminal", () => {
  assert.equal(canTransition("under_review", "signed"), true);
  assert.equal(canTransition("signed", "under_review"), false);
  assert.equal(canTransition("signed", "abandoned"), false);
});

test("lifecycle: state is derived from facts, not supplied by the client", () => {
  const s = new PrologueSession("derive", "en");
  s.attachChart(chartSlice(), 1, true);
  assert.equal(upsertFromMap(s.map, { patientId: "p" }).state, "created");

  s.grantConsent();
  assert.equal(upsertFromMap(s.map, { patientId: "p" }).state, "consented");

  s.patientSaid("rash, four days", 60);
  assert.equal(upsertFromMap(s.map, { patientId: "p" }).state, "in_progress");

  s.patientSaid("my mouth is sore", 90);
  assert.equal(upsertFromMap(s.map, { patientId: "p" }).state, "ready_for_review");
});

test("lifecycle: illegal transitions are refused", () => {
  seed("bad");
  assert.throws(() => transition("bad", "signed"), InvalidTransitionError);
});

/* ---------------- authorisation ---------------- */

test("SAFETY: an unknown clinician cannot finalize", () => {
  assert.throws(() => authorizeClinician("dr-nobody"), NotAuthorizedError);
});

test("SAFETY: pilot mode requires a configured secret", () => {
  process.env.PROLOGUE_MODE = "pilot";
  assert.throws(
    () => authorizeClinician("practitioner-osei"),
    /PROLOGUE_CLINICIAN_SECRET is not configured/
  );

  process.env.PROLOGUE_CLINICIAN_SECRET = "correct-horse";
  assert.throws(() => authorizeClinician("practitioner-osei", "wrong"), NotAuthorizedError);
  assert.equal(authorizeClinician("practitioner-osei", "correct-horse").name, "Dr. Amara Osei");
});

/* ---------------- the transaction ---------------- */

test("GOLDEN: approval finalizes server-side and records a signature", async () => {
  const session = seed("golden", { escalate: true });
  transition("golden", "under_review");

  const r = await approveIntake(session, {
    sessionId: "golden",
    clinicianId: "practitioner-osei",
    rejectedItemIds: [],
  });

  assert.equal(r.state, "signed");
  assert.equal(r.idempotentReplay, false);
  assert.equal(r.signature.by, "Dr. Amara Osei");
  assert.ok(r.signature.approvedItemIds.length > 0);
  assert.ok(r.signature.provenanceId, "Provenance must be recorded, not just returned");
  assert.ok(r.signature.auditEventId, "AuditEvent must be recorded");
  assert.equal(session.map.compositionStatus, "final");
});

test("SAFETY: a client-supplied final status is ignored", async () => {
  const s = new PrologueSession("liar", "en");
  s.attachChart(chartSlice(), 1, true);
  s.grantConsent();
  s.patientSaid("rash, four days", 60);
  // A hostile or stale client claims the session is already signed.
  s.map.compositionStatus = "final";
  s.map.approvedBy = "Dr. Nobody";

  const session = upsertFromMap(s.map, { patientId: "p" });
  assert.notEqual(session.state, "signed", "client cannot declare finality via lifecycle");
  // Regression: the client's compositionStatus was previously persisted verbatim,
  // so a stale tab could make the UI show an attestation that never happened.
  assert.equal(session.map.compositionStatus, "preliminary", "client cannot declare finality via the map");
  assert.equal(session.map.approvedBy, undefined, "client cannot name an attester");
  assert.equal(session.map.approvedAt, undefined);

  transition("liar", "ready_for_review");
  transition("liar", "under_review");
  const r = await approveIntake(session, {
    sessionId: "liar",
    clinicianId: "practitioner-osei",
    rejectedItemIds: [],
  });
  assert.equal(r.signature.by, "Dr. Amara Osei", "attester comes from the roster, not the client");
});

test("SAFETY: writes to a signed session are ignored, not applied", () => {
  const session = seed("locked", { escalate: true });
  session.state = "signed";
  session.signature = {
    by: "Dr. Amara Osei", at: new Date().toISOString(),
    approvedItemIds: [], rejectedItemIds: [],
    compositionId: "c", provenanceId: "p", auditEventId: "a",
    persisted: false, origin: "fixture",
  };

  const tampered = structuredClone(session.map);
  tampered.items.push({ id: "injected", source: "INFERRED", text: "injected", status: "draft" });
  const after = upsertFromMap(tampered, { patientId: "maria-delgado-synthetic" });

  assert.equal(after.state, "signed");
  assert.ok(!after.map.items.some((i) => i.id === "injected"), "late write must not mutate a signed record");
});

test("IDEMPOTENT: replaying approval returns the original signature", async () => {
  const session = seed("idem", { escalate: true });
  transition("idem", "under_review");

  const first = await approveIntake(session, {
    sessionId: "idem", clinicianId: "practitioner-osei", rejectedItemIds: [],
  });
  const second = await approveIntake(session, {
    sessionId: "idem", clinicianId: "practitioner-osei", rejectedItemIds: [],
  });

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.signature.at, first.signature.at, "must not re-sign");
});

test("rejected ids must exist in the canonical item set", async () => {
  const session = seed("unknown-items", { escalate: true });
  transition("unknown-items", "under_review");
  await assert.rejects(
    () => approveIntake(session, {
      sessionId: "unknown-items",
      clinicianId: "practitioner-osei",
      rejectedItemIds: ["item-that-does-not-exist"],
    }),
    UnknownItemsError
  );
});

test("rejected items are persisted as rejected, not silently approved", async () => {
  const session = seed("rej", { escalate: true });
  transition("rej", "under_review");
  const inferred = session.map.items.find((i) => i.source === "INFERRED")!;

  const r = await approveIntake(session, {
    sessionId: "rej", clinicianId: "practitioner-osei", rejectedItemIds: [inferred.id],
  });

  assert.deepEqual(r.signature.rejectedItemIds, [inferred.id]);
  assert.equal(session.map.items.find((i) => i.id === inferred.id)!.status, "rejected");
  assert.ok(!r.signature.approvedItemIds.includes(inferred.id));
});

/* ---------------- draft projection ---------------- */

test("SAFETY: drafts never include a Condition", () => {
  const session = seed("drafts", { escalate: true });
  session.map.reconciliation = [
    { drug: "furosemide", prescribed: "furosemide 20mg", reported: "stopped taking it", state: "discrepancy" },
  ];
  const drafts = projectDrafts(session);
  assert.ok(!drafts.some((d) => d.resourceType === "Condition"), "the agent may not assert a Condition");
});

test("drafts cover the expected resource types", () => {
  const session = seed("cover", { escalate: true });
  session.map.reconciliation = [
    { drug: "furosemide", prescribed: "furosemide 20mg", reported: "stopped taking it", state: "discrepancy" },
  ];
  const kinds = new Set(projectDrafts(session).map((d) => d.resourceType));
  for (const k of ["Consent", "QuestionnaireResponse", "Observation", "DetectedIssue", "MedicationStatement", "Task"]) {
    assert.ok(kinds.has(k), `missing draft resource: ${k}`);
  }
});

test("SAFETY: every projected draft survives writeDraft's final-status guard", async () => {
  const session = seed("guard", { escalate: true });
  const drafts = [...projectDrafts(session), buildComposition(session, { id: "x", name: "Dr. X" })];
  const r = await writeDraft(drafts);
  assert.equal(r.data.written, drafts.length);
});

test("MedicationStatement records patient-reported use without overwriting the prescription", () => {
  const session = seed("recon");
  session.map.reconciliation = [
    { drug: "furosemide", prescribed: "furosemide 20mg daily", reported: "stopped taking it", state: "discrepancy" },
  ];
  const ms = projectDrafts(session).find((d) => d.resourceType === "MedicationStatement")!;
  assert.equal(ms.status, "stopped");
  assert.ok(!("MedicationRequest" in ms));
  assert.match(JSON.stringify(ms.note), /furosemide 20mg daily/, "the prescribed value is preserved as context");
});

/* ---------------- runtime modes ---------------- */

test("SAFETY: pilot mode refuses to substitute synthetic data", () => {
  assert.equal(runtimeMode(), "demo");
  assert.doesNotThrow(() => assertFixtureAllowed("Medplum"));

  process.env.PROLOGUE_MODE = "pilot";
  assert.equal(runtimeMode(), "pilot");
  assert.throws(() => assertFixtureAllowed("Medplum", "no credentials"), IntegrationUnavailableError);
});

test("SAFETY: pilot approval surfaces the integration failure instead of claiming success", async () => {
  process.env.PROLOGUE_MODE = "pilot";
  process.env.PROLOGUE_CLINICIAN_SECRET = "s3cret";
  const session = seed("pilot-fail", { escalate: true });
  transition("pilot-fail", "under_review");

  await assert.rejects(
    () => approveIntake(session, {
      sessionId: "pilot-fail",
      clinicianId: "practitioner-osei",
      clinicianSecret: "s3cret",
      rejectedItemIds: [],
    }),
    IntegrationUnavailableError,
    "with no Medplum credentials, pilot mode must fail rather than sign against a fixture"
  );
  assert.notEqual(session.state, "signed", "a failed transaction must not leave a signed session");
});

test("demo mode signs but labels the record as a fixture", async () => {
  const session = seed("demo-ok", { escalate: true });
  transition("demo-ok", "under_review");
  const r = await approveIntake(session, {
    sessionId: "demo-ok", clinicianId: "practitioner-osei", rejectedItemIds: [],
  });
  assert.equal(r.signature.origin, "fixture");
  assert.equal(r.signature.persisted, false);
  assert.ok(r.warnings.some((w) => /fixture/i.test(w)), "degradation must be stated, not hidden");
});

/* ---------------- queue ---------------- */

test("queue orders high-severity escalations first", () => {
  seed("routine");
  seed("urgent", { escalate: true });
  const q = listSessions();
  assert.equal(q[0].id, "urgent", "an escalated session must outrank a routine one");
});

test("sessions are patient-keyed", () => {
  const a = seed("pa");
  a.patientId = "patient-a";
  const q = listSessions({ patientId: "patient-a" });
  assert.ok(q.every((s) => s.patientId === "patient-a"));
});

/* ---------------- clinical interval stability ---------------- */

test("SAFETY: day-of-therapy is calendar-based and clock-stable", () => {
  const authored = "2026-07-10";
  const morning = new Date("2026-08-01T06:00:00Z");
  const evening = new Date("2026-08-01T23:30:00Z");
  assert.equal(calendarDaysAgo(authored, morning), 22);
  assert.equal(
    calendarDaysAgo(authored, evening),
    22,
    "the same calendar day must not yield a different day-of-therapy"
  );
});
