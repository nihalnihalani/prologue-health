/**
 * Intake session lifecycle and the server-authoritative approval transaction.
 *
 * WHAT THIS FIXES
 *
 * Before this module, the browser declared clinical finality: the clinician page
 * set `compositionStatus: "final"` in client state and wrote it to the store,
 * while the server only ever persisted a *preliminary* Composition and returned
 * a Provenance object it never saved. Clinical authority lived in the browser.
 *
 * Here, the server owns it:
 *   - canonical session state is reloaded from the store, never trusted from the client
 *   - the client's `compositionStatus` is ignored entirely
 *   - the clinician is authorised before anything is written
 *   - item decisions are validated against the canonical item set
 *   - drafts are persisted, THEN the Composition transitions to final
 *   - Provenance and AuditEvent are actually written
 *   - the transaction is idempotent: replaying it returns the first result
 */

import type { StoryMap, StoryItem } from "./types";
import { writeDraft, finalizeComposition, medplumConfigured } from "./medplum";
import { assertFixtureAllowed, isPilot } from "./runtime";

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/**
 * Explicit states. `signed` is terminal; nothing may leave it.
 *
 *   created          session exists, consent not yet given
 *   consented        recording permitted
 *   in_progress      conversation underway
 *   ready_for_review queued for a clinician
 *   under_review     a clinician has it open
 *   signed           clinician attested; terminal
 *   abandoned        expired or cancelled without review
 */
export type IntakeState =
  | "created"
  | "consented"
  | "in_progress"
  | "ready_for_review"
  | "under_review"
  | "signed"
  | "abandoned";

const TRANSITIONS: Record<IntakeState, IntakeState[]> = {
  created: ["consented", "abandoned"],
  consented: ["in_progress", "abandoned"],
  in_progress: ["ready_for_review", "abandoned"],
  ready_for_review: ["under_review", "abandoned"],
  under_review: ["signed", "ready_for_review", "abandoned"],
  signed: [], // terminal
  abandoned: [],
};

export function canTransition(from: IntakeState, to: IntakeState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: IntakeState, to: IntakeState) {
    super(`illegal intake transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Server-side session envelope. The StoryMap is the clinical payload. */
export interface IntakeSession {
  id: string;
  /** Patient this session belongs to. Sessions are patient-keyed, not global. */
  patientId: string;
  appointmentId?: string;
  state: IntakeState;
  locale: string;
  map: StoryMap;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  /** Set once the approval transaction commits. Makes replay idempotent. */
  signature?: SignatureRecord;
}

export interface SignatureRecord {
  by: string;
  at: string;
  approvedItemIds: string[];
  rejectedItemIds: string[];
  compositionId: string;
  provenanceId: string;
  auditEventId: string;
  /** Whether the durable write actually reached Medplum. */
  persisted: boolean;
  origin: "live" | "fixture";
}

/* ------------------------------------------------------------------ */
/* Authorisation                                                       */
/* ------------------------------------------------------------------ */

export class NotAuthorizedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "NotAuthorizedError";
  }
}

/**
 * Pilot-grade identity is Phase 3. What matters *now* is that finalisation has
 * an authorisation gate at all, that it is server-side, and that the identity is
 * recorded on the Provenance rather than accepted as a display string.
 *
 * In demo mode a roster entry suffices. In pilot mode a shared secret is
 * additionally required, so a browser alone cannot finalise clinical data.
 */
export interface Clinician {
  id: string;
  name: string;
  npi?: string;
}

const ROSTER: Record<string, Clinician> = {
  "practitioner-osei": { id: "practitioner-osei", name: "Dr. Amara Osei", npi: "1999999984" },
  "practitioner-chen": { id: "practitioner-chen", name: "Dr. Chen", npi: "1999999985" },
};

export function authorizeClinician(clinicianId: string, secret?: string): Clinician {
  const c = ROSTER[clinicianId];
  if (!c) throw new NotAuthorizedError(`unknown clinician: ${clinicianId}`);

  if (isPilot()) {
    const expected = process.env.PROLOGUE_CLINICIAN_SECRET;
    if (!expected) {
      throw new NotAuthorizedError(
        "[pilot] PROLOGUE_CLINICIAN_SECRET is not configured; refusing to finalize"
      );
    }
    if (secret !== expected) throw new NotAuthorizedError("invalid clinician credentials");
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* Draft resource projection                                           */
/* ------------------------------------------------------------------ */

/**
 * Project the StoryMap onto FHIR drafts.
 *
 * Deliberately absent: `Condition`. Asserting a condition is a clinical act.
 * The agent produces `Observation` (what was observed) and `DetectedIssue`
 * (what warrants attention); only a clinician may create a `Condition`.
 */
export function projectDrafts(session: IntakeSession): Record<string, unknown>[] {
  const { map, patientId } = session;
  const subject = { reference: `Patient/${patientId}` };
  const out: Record<string, unknown>[] = [];

  if (map.consent.granted) {
    out.push({
      resourceType: "Consent",
      status: "active",
      scope: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy" }] },
      category: [{ coding: [{ system: "http://loinc.org", code: "59284-0", display: "Consent Document" }] }],
      patient: subject,
      dateTime: map.consent.at,
      provision: { type: "permit", purpose: [{ code: "TREAT" }] },
    });
  }

  out.push({
    resourceType: "QuestionnaireResponse",
    status: "in-progress",
    subject,
    authored: session.updatedAt,
    item: map.items
      .filter((i) => i.source === "PATIENT")
      .map((i, n) => ({
        linkId: `q${n + 1}`,
        text: "Patient statement",
        answer: [{ valueString: i.verbatim ?? i.text }],
      })),
  });

  for (const i of map.items.filter((x) => x.source === "PATIENT")) {
    out.push({
      resourceType: "Observation",
      status: "preliminary",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
      code: { text: "Patient-reported symptom" },
      subject,
      effectiveDateTime: session.updatedAt,
      valueString: i.text,
      note: i.lang ? [{ text: `Spoken in ${i.lang}` }] : undefined,
    });
  }

  for (const i of map.items.filter((x) => x.source === "INFERRED")) {
    out.push({
      resourceType: "DetectedIssue",
      status: "preliminary",
      code: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: "DRG",
            display: "Drug Interaction Alert",
          },
        ],
      },
      severity: i.severity ?? "moderate",
      patient: subject,
      identifiedDateTime: session.updatedAt,
      author: { display: "Prologue pre-visit agent (Device)" },
      detail: i.text,
      evidence: i.citation ? [{ code: [{ text: i.citation.label }] }] : undefined,
      implicated: (i.implicates ?? []).map((r) => ({ reference: r })),
    });
  }

  for (const r of map.reconciliation.filter((x) => x.state !== "match")) {
    out.push({
      resourceType: "MedicationStatement",
      // Patient-reported use. Never overwrites the prescribed MedicationRequest.
      status: r.reported?.includes("stopped") ? "stopped" : "active",
      medicationCodeableConcept: { text: r.drug },
      subject,
      dateAsserted: session.updatedAt,
      informationSource: subject,
      note: [{ text: r.note ?? `Chart: ${r.prescribed ?? "not listed"}; patient reports: ${r.reported}` }],
    });
  }

  if (map.escalation) {
    out.push({
      resourceType: "Task",
      status: "requested",
      intent: "order",
      priority: map.escalation.severity === "high" ? "urgent" : "routine",
      description: map.escalation.clinicMessage,
      for: subject,
      authoredOn: session.updatedAt,
    });
  }

  return out;
}

/** The narrative Composition. Always created preliminary; finalized separately. */
export function buildComposition(session: IntakeSession, clinician: Clinician) {
  const { map, patientId } = session;
  const esc = map.escalation ? `<p><b>Escalated:</b> ${map.escalation.clinicMessage}</p>` : "";
  return {
    resourceType: "Composition",
    status: "preliminary",
    type: { coding: [{ system: "http://loinc.org", code: "34117-2", display: "History and physical note" }] },
    title: "Prologue pre-visit brief",
    subject: { reference: `Patient/${patientId}` },
    date: session.updatedAt,
    author: [{ display: "Prologue pre-visit agent (Device)" }],
    attester: [{ mode: "legal", party: { display: clinician.name } }],
    section: [
      {
        title: "Pre-visit brief",
        text: {
          status: "generated",
          div: `<div xmlns="http://www.w3.org/1999/xhtml">${esc}<p>${map.chiefConcern ?? "Pre-visit intake"}</p></div>`,
        },
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The approval transaction                                            */
/* ------------------------------------------------------------------ */

export interface ApprovalRequest {
  sessionId: string;
  clinicianId: string;
  clinicianSecret?: string;
  /** Item ids the clinician rejected. Everything else in the canonical set is accepted. */
  rejectedItemIds: string[];
}

export interface ApprovalResult {
  sessionId: string;
  state: IntakeState;
  signature: SignatureRecord;
  /** True when this call replayed an already-committed signature. */
  idempotentReplay: boolean;
  warnings: string[];
}

export class UnknownItemsError extends Error {
  constructor(ids: string[]) {
    super(`rejected item ids not present in the canonical session: ${ids.join(", ")}`);
    this.name = "UnknownItemsError";
  }
}

/**
 * Finalize an intake.
 *
 * The session argument is the CANONICAL server copy. The caller must load it
 * from the store — nothing here is taken from the client except the clinician
 * identity and the set of rejected item ids, both of which are validated.
 */
export async function approveIntake(
  session: IntakeSession,
  req: ApprovalRequest
): Promise<ApprovalResult> {
  const warnings: string[] = [];

  // 1. Idempotency: a committed signature replays rather than double-writing.
  if (session.state === "signed" && session.signature) {
    return {
      sessionId: session.id,
      state: session.state,
      signature: session.signature,
      idempotentReplay: true,
      warnings: ["session was already signed; returning the original signature"],
    };
  }

  // 2. Authorisation before any write.
  const clinician = authorizeClinician(req.clinicianId, req.clinicianSecret);

  // 3. Legal transition only.
  if (!canTransition(session.state, "signed")) {
    if (!canTransition(session.state, "under_review")) {
      throw new InvalidTransitionError(session.state, "signed");
    }
    session.state = "under_review";
  }

  // 4. Validate decisions against the CANONICAL item set.
  const canonical = new Set(session.map.items.map((i) => i.id));
  const unknown = req.rejectedItemIds.filter((id) => !canonical.has(id));
  if (unknown.length) throw new UnknownItemsError(unknown);

  const rejected = new Set(req.rejectedItemIds);
  const approvedItemIds: string[] = [];
  for (const item of session.map.items) {
    const next: StoryItem["status"] = rejected.has(item.id) ? "rejected" : "approved";
    item.status = next;
    if (next === "approved") approvedItemIds.push(item.id);
  }

  // 5. Persist drafts. writeDraft() refuses final/completed, so this cannot
  //    accidentally finalize anything.
  const drafts = projectDrafts(session);
  const composition = buildComposition(session, clinician);
  let persisted = false;
  let compositionId = `local/Composition/${session.id}`;
  let origin: "live" | "fixture" = "fixture";

  if (medplumConfigured) {
    const draftWrite = await writeDraft([...drafts, composition]);
    persisted = !draftWrite.simulated;
    origin = draftWrite.simulated ? "fixture" : "live";
    const created = draftWrite.data.ids.find((x) => x.startsWith("Composition/"));
    if (created) compositionId = created;
    if (draftWrite.simulated) {
      assertFixtureAllowed("Medplum", "draft persistence fell back to a fixture");
      warnings.push("Medplum write degraded to a fixture; the durable record is NOT live");
    }
  } else {
    assertFixtureAllowed("Medplum", "no credentials configured");
    warnings.push("Medplum is not configured; the durable record is a fixture");
  }

  // 6. The real preliminary -> final transition, server-side, after the drafts land.
  const now = new Date().toISOString();
  if (persisted) {
    const fin = await finalizeComposition(compositionId.split("/")[1], clinician.name, now);
    if (!fin.ok) {
      // Do NOT report success we did not achieve.
      throw new Error(`composition finalization failed: ${fin.error ?? "unknown"}`);
    }
  } else {
    warnings.push("preliminary -> final was recorded locally only");
  }

  // 7. Provenance and AuditEvent are written, not merely returned.
  const provenance = {
    resourceType: "Provenance",
    target: [{ reference: compositionId }],
    recorded: now,
    agent: [
      {
        type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type", code: "attester" }] },
        who: { display: clinician.name, identifier: clinician.npi ? { value: clinician.npi } : undefined },
      },
    ],
    activity: { text: "Clinician review and attestation of pre-visit brief" },
  };

  const auditEvent = {
    resourceType: "AuditEvent",
    type: { system: "http://terminology.hl7.org/CodeSystem/audit-event-type", code: "rest", display: "RESTful Operation" },
    action: "U",
    recorded: now,
    outcome: "0",
    agent: [{ who: { display: clinician.name }, requestor: true }],
    source: { observer: { display: "Prologue" } },
    entity: [
      { what: { reference: compositionId }, detail: [{ type: "approvedItems", valueString: String(approvedItemIds.length) }, { type: "rejectedItems", valueString: String(req.rejectedItemIds.length) }] },
    ],
  };

  let provenanceId = `local/Provenance/${session.id}`;
  let auditEventId = `local/AuditEvent/${session.id}`;
  if (medplumConfigured) {
    const w = await writeDraft([provenance, auditEvent]);
    provenanceId = w.data.ids.find((x) => x.startsWith("Provenance/")) ?? provenanceId;
    auditEventId = w.data.ids.find((x) => x.startsWith("AuditEvent/")) ?? auditEventId;
  }

  // 8. Commit.
  const signature: SignatureRecord = {
    by: clinician.name,
    at: now,
    approvedItemIds,
    rejectedItemIds: req.rejectedItemIds,
    compositionId,
    provenanceId,
    auditEventId,
    persisted,
    origin,
  };

  session.state = "signed";
  session.signature = signature;
  session.updatedAt = now;
  session.map.compositionStatus = "final";
  session.map.approvedBy = clinician.name;
  session.map.approvedAt = now;

  return { sessionId: session.id, state: "signed", signature, idempotentReplay: false, warnings };
}
