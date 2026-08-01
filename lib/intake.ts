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
import { writeDraft, finalizeComposition, medplumConfigured, resolveLivePatientId } from "./medplum";
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

/**
 * The outcome of one persistence attempt.
 *
 * A receipt may only claim a resource was written when THAT write succeeded.
 * Placeholder ids were previously emitted as though they were FHIR resources.
 */
export interface WriteReceipt {
  resourceType: string;
  /** Present only when a real server assigned one. */
  id?: string;
  status: "written" | "not-attempted" | "failed";
  origin: "live" | "fixture";
  error?: string;
}

export interface SignatureRecord {
  by: string;
  at: string;
  approvedItemIds: string[];
  editedItemIds: string[];
  rejectedItemIds: string[];
  /** Per-resource truth. No entry means it was never attempted. */
  writes: WriteReceipt[];
  /** True only when EVERY attempted write succeeded against a live server. */
  fullyPersisted: boolean;
  /** True when some writes landed and others did not — inspectable, retryable. */
  partial: boolean;
  origin: "live" | "fixture";
}

/** Stable key so a retry does not create unbounded duplicates. */
export const idempotencyKey = (sessionId: string) => `prologue-intake-${sessionId}`;

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
 *
 * `patientId` defaults to the session's own business key, but the approval
 * transaction passes Medplum's real, resolved Patient id instead — Medplum
 * never assigns the business key as a live id, so writing drafts that
 * reference it verbatim would create resources pointing at a Patient that
 * does not exist.
 */
export function projectDrafts(session: IntakeSession, patientId: string = session.patientId): Record<string, unknown>[] {
  const { map } = session;
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
      // Required to satisfy FHIR's ppc-1 invariant (policy.exists() or
      // policyRule.exists()). This consent covers the patient's HIPAA notice
      // of privacy practices acknowledgment for the pre-visit intake.
      policyRule: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/consentpolicy",
            code: "hipaa-npp",
            display: "HIPAA Notice of Privacy Practices",
          },
        ],
      },
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

  for (const i of map.items.filter((x) => x.source === "PATIENT" && x.status !== "rejected")) {
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

  /**
   * Only APPROVED inferences become DetectedIssue.
   *
   * This previously projected every inference regardless of status, so an item
   * the clinician explicitly rejected still created a clinical resource. The
   * rejection remained visible in the UI while the chart disagreed with it.
   * A rejected finding stays auditable in the StoryMap and the AuditEvent; it
   * does not become a clinical resource.
   */
  for (const i of map.items.filter((x) => x.source === "INFERRED" && x.status === "approved")) {
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
export function buildComposition(session: IntakeSession, clinician: Clinician, patientId: string = session.patientId) {
  const { map } = session;
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

export type Decision = "approve" | "edit" | "reject";

export interface ItemDecision {
  itemId: string;
  decision: Decision;
  /** Required for "edit": the clinician's corrected text, which is what promotes. */
  editedText?: string;
}

export interface ApprovalRequest {
  sessionId: string;
  clinicianId: string;
  clinicianSecret?: string;
  /**
   * An EXPLICIT decision for every promotable item.
   *
   * Silence is no longer consent. Previously anything not rejected was
   * auto-approved, which meant an unread packet promoted every inference in it.
   */
  decisions: ItemDecision[];
}

export class IncompleteReviewError extends Error {
  readonly undecided: string[];
  constructor(undecided: string[]) {
    super(
      `every promotable item needs an explicit approve/edit/reject decision; ` +
        `${undecided.length} undecided: ${undecided.join(", ")}`
    );
    this.name = "IncompleteReviewError";
    this.undecided = undecided;
  }
}

/**
 * Items a clinician must rule on.
 *
 * Generated content is promotable. A verbatim patient statement is not a
 * clinical assertion by the system, so it is recorded but does not require a
 * per-item ruling.
 */
export function promotableItems(map: StoryMap): StoryItem[] {
  return map.items.filter((i) => i.source === "INFERRED");
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
  const unknown = req.decisions.map((d) => d.itemId).filter((id) => !canonical.has(id));
  if (unknown.length) throw new UnknownItemsError(unknown);

  // Every promotable item needs an explicit ruling. Silence is not consent.
  const byId = new Map(req.decisions.map((d) => [d.itemId, d]));
  const undecided = promotableItems(session.map)
    .filter((i) => !byId.has(i.id))
    .map((i) => i.id);
  if (undecided.length) throw new IncompleteReviewError(undecided);

  const approvedItemIds: string[] = [];
  const editedItemIds: string[] = [];
  const rejectedItemIds: string[] = [];

  for (const item of session.map.items) {
    const d = byId.get(item.id);
    if (!d) {
      // Not promotable (a verbatim patient statement). Recorded, not asserted.
      item.status = "approved";
      continue;
    }
    if (d.decision === "reject") {
      item.status = "rejected";
      rejectedItemIds.push(item.id);
    } else if (d.decision === "edit") {
      if (!d.editedText?.trim()) {
        throw new IncompleteReviewError([`${item.id} (edit requires editedText)`]);
      }
      // The clinician's wording is what promotes; the original is preserved for
      // audit on the item itself.
      item.originalText = item.text;
      item.text = d.editedText.trim();
      item.editedBy = clinician.name;
      item.status = "approved";
      editedItemIds.push(item.id);
      approvedItemIds.push(item.id);
    } else {
      item.status = "approved";
      approvedItemIds.push(item.id);
    }
  }

  // 5. Persist drafts. writeDraft() refuses final/completed, so this cannot
  //    accidentally finalize anything.
  const writes: WriteReceipt[] = [];
  const now = new Date().toISOString();
  let compositionId: string | undefined;

  if (!medplumConfigured) {
    assertFixtureAllowed("Medplum", "no credentials configured");
    warnings.push("Medplum is not configured; NOTHING was persisted");
    for (const r of [...projectDrafts(session), buildComposition(session, clinician)]) {
      writes.push({ resourceType: String(r.resourceType), status: "not-attempted", origin: "fixture" });
    }
  } else {
    // Resolve the live Patient id ONCE for the whole transaction — every
    // draft's subject/patient reference is built from this same value, never
    // re-resolved per resource.
    const resolution = await resolveLivePatientId(session.patientId);

    if (!resolution.id) {
      const reason = resolution.reason ?? "patient could not be resolved to a live Medplum id";
      // Pilot mode treats an unresolvable patient exactly like any other
      // integration failure: it surfaces rather than substituting anything.
      assertFixtureAllowed("Medplum", reason);
      warnings.push(
        `Medplum write skipped: ${reason}. A resource referencing an unresolved patient would be a fabricated ` +
          "link, so nothing was written."
      );
      // patientId here is irrelevant — projectDrafts()/buildComposition()'s
      // default is only used to enumerate resourceTypes for the receipt;
      // these objects are never sent to Medplum.
      for (const r of [...projectDrafts(session), buildComposition(session, clinician)]) {
        writes.push({ resourceType: String(r.resourceType), status: "failed", origin: "fixture", error: reason });
      }
    } else {
      const livePatientId = resolution.id;
      const drafts = projectDrafts(session, livePatientId);
      const composition = buildComposition(session, clinician, livePatientId);

      let w;
      try {
        w = await writeDraft([...drafts, composition]);
      } catch (err) {
        // Nothing has been finalized yet, so failing here is clean.
        throw new Error(`draft persistence failed before finalization: ${(err as Error).message}`);
      }

      if (w.simulated) assertFixtureAllowed("Medplum", "draft persistence degraded to a fixture");

      const anyFailed = w.data.results.some((r) => !r.ok);
      if (w.simulated) {
        warnings.push(`Medplum write degraded; the durable record is NOT live: ${w.detail ?? "no client available"}`);
      } else if (anyFailed) {
        warnings.push(`Some Medplum writes failed; the durable record is only PARTIALLY live: ${w.detail}`);
      }

      // Per-resource outcome — one invalid resource must not fail the others.
      for (const r of w.data.results) {
        if (r.ok) {
          writes.push({ resourceType: r.resourceType, id: r.id, status: "written", origin: "live" });
          if (r.resourceType === "Composition") compositionId = r.id;
        } else {
          writes.push({ resourceType: r.resourceType, status: "failed", origin: "fixture", error: r.error });
        }
      }
    }
  }

  // 6. The real preliminary -> final transition, only after drafts landed.
  let finalized = false;
  if (compositionId) {
    const fin = await finalizeComposition(compositionId, clinician.name, now);
    if (!fin.ok) throw new Error(`composition finalization failed: ${fin.error ?? "unknown"}`);
    finalized = true;
  } else {
    warnings.push("Composition was not persisted; preliminary -> final was NOT performed");
  }

  // 7. Provenance and AuditEvent. If these fail the signature is PARTIAL —
  //    the Composition is final but its attestation trail is incomplete. That
  //    is recorded rather than hidden, and the key makes a retry safe.
  const provenance = {
    resourceType: "Provenance",
    target: compositionId ? [{ reference: `Composition/${compositionId}` }] : [],
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
      {
        what: compositionId ? { reference: `Composition/${compositionId}` } : undefined,
        detail: [
          { type: "idempotencyKey", valueString: idempotencyKey(session.id) },
          { type: "approvedItems", valueString: String(approvedItemIds.length) },
          { type: "editedItems", valueString: String(editedItemIds.length) },
          { type: "rejectedItems", valueString: String(rejectedItemIds.length) },
        ],
      },
    ],
  };

  if (medplumConfigured && finalized) {
    const w = await writeDraft([provenance, auditEvent]);
    const anyFailed = w.simulated || w.data.results.some((r) => !r.ok);
    for (const r of w.data.results) {
      writes.push(
        r.ok
          ? { resourceType: r.resourceType, id: r.id, status: "written", origin: "live" }
          : { resourceType: r.resourceType, status: "failed", origin: "fixture", error: r.error }
      );
    }
    if (anyFailed) {
      warnings.push(
        `attestation trail incomplete: ${w.detail ?? "degraded"}. The Composition is final but Provenance/AuditEvent ` +
          `did not fully persist. Retry is safe — idempotency key ${idempotencyKey(session.id)}.`
      );
    }
  } else {
    for (const t of ["Provenance", "AuditEvent"]) {
      writes.push({ resourceType: t, status: "not-attempted", origin: "fixture" });
    }
  }

  // 8. Commit. Origin reflects what actually happened — never credential
  //    presence alone — so it can only be "live" once something really wrote.
  const attempted = writes.filter((w) => w.status !== "not-attempted");
  const succeeded = writes.filter((w) => w.status === "written");
  const signature: SignatureRecord = {
    by: clinician.name,
    at: now,
    approvedItemIds,
    editedItemIds,
    rejectedItemIds,
    writes,
    fullyPersisted: attempted.length > 0 && attempted.length === succeeded.length,
    partial: succeeded.length > 0 && succeeded.length < attempted.length,
    origin: succeeded.length > 0 ? "live" : "fixture",
  };

  session.state = "signed";
  session.signature = signature;
  session.updatedAt = now;
  session.map.compositionStatus = "final";
  session.map.approvedBy = clinician.name;
  session.map.approvedAt = now;

  return { sessionId: session.id, state: "signed", signature, idempotentReplay: false, warnings };
}
