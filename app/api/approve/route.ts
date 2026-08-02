import { NextResponse } from "next/server";
import { getSession, putSession } from "@/lib/store";
import {
  approveIntake,
  NotAuthorizedError,
  UnknownItemsError,
  IncompleteReviewError,
  InvalidTransitionError,
  type ItemDecision,
  type IntakeState,
} from "@/lib/intake";
import { IntegrationUnavailableError, runtimeMode } from "@/lib/runtime";
import { persistApprovalDecisions, recordApprovalOutcome, loadSession } from "@/lib/durableStore";
import { databaseConfigured } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * THE CLINICAL AUTHORITY BOUNDARY.
 *
 * Everything about finalization happens here, server-side:
 *   - canonical session is reloaded from the store; the client's copy is ignored
 *   - a client-supplied compositionStatus is NEVER honoured
 *   - the clinician is authorised before any write
 *   - rejected item ids are validated against the canonical item set
 *   - drafts persist first, then the Composition transitions to final
 *   - Provenance and AuditEvent are written
 *   - replay returns the original signature instead of double-writing
 */
export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    clinicianId?: string;
    clinicianSecret?: string;
    decisions?: ItemDecision[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { sessionId, clinicianId, clinicianSecret, decisions = [] } = body;
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  if (!clinicianId) return NextResponse.json({ error: "clinicianId is required" }, { status: 400 });

  // Canonical state. Nothing clinical is taken from the request.
  let session = getSession(sessionId);

  if (!session) {
    /*
     * Restart recovery.
     *
     * This used to 404 whenever the in-process map had lost the session — so a
     * server restart between intake and review made a real, durably-stored
     * session permanently unapprovable, and the clinician had no way to tell
     * that from "no such session". Rehydrate from durable storage instead.
     */
    const durable = await loadSession(sessionId);
    if (!durable?.map) {
      return NextResponse.json({ error: "unknown session" }, { status: 404 });
    }
    // A recovered session re-enters review, never review-complete: the durable
    // state is the authority for what has happened so far.
    const recoveredState: IntakeState =
      durable.state === "signed" ? "signed" : "ready_for_review";

    session = putSession({
      id: sessionId,
      patientId: durable.patientRef,
      state: recoveredState,
      locale: durable.locale,
      map: durable.map,
      createdAt: durable.updatedAt,
      updatedAt: durable.updatedAt,
    });
  }

  try {
    /*
     * Record the DECISIONS before attempting any external write.
     *
     * The clinician's judgement is the thing that must not be lost. Writing it
     * first — with the authorised writes enqueued in the same transaction —
     * means a crash mid-approval leaves a recoverable record of what was
     * decided, instead of no evidence that review ever happened.
     */
    let durableDecisions: Awaited<ReturnType<typeof persistApprovalDecisions>> | null = null;
    if (databaseConfigured) {
      durableDecisions = await persistApprovalDecisions({
        externalId: sessionId,
        clinicianSubject: clinicianId,
        decisions: decisions.map((d) => ({
          itemKey: d.itemId,
          kind: d.decision,
          editedText: d.editedText,
        })),
        writes: [
          {
            idempotencyKey: `approve:${sessionId}:Composition`,
            resourceType: "Composition",
            payload: { sessionId, clinicianId },
          },
        ],
      });

      if (durableDecisions.alreadySigned) {
        return NextResponse.json(
          { error: "session is already signed", sessionId },
          { status: 409 }
        );
      }
    }

    const result = await approveIntake(session, {
      sessionId,
      clinicianId,
      clinicianSecret,
      decisions,
    });
    putSession(session);

    /*
     * Sign durably ONLY on what actually landed.
     *
     * `signed` is a claim about the world, not about our intent, so the durable
     * transition happens from the receipts rather than from having reached the
     * end of this function.
     */
    let durableSigned: boolean | null = null;
    if (databaseConfigured && result.signature) {
      const outcome = await recordApprovalOutcome({
        externalId: sessionId,
        clinicianSubject: clinicianId,
        receipts: result.signature.writes.map((w) => ({
          resourceType: w.resourceType,
          id: w.id,
          status: w.status,
          error: w.error,
        })),
      });
      durableSigned = outcome.signed;
    }

    return NextResponse.json(
      {
        sessionId: result.sessionId,
        state: result.state,
        compositionStatus: session.map.compositionStatus,
        signature: result.signature,
        idempotentReplay: result.idempotentReplay,
        warnings: result.warnings,
        mode: runtimeMode(),
        // Honest about the durable record: a receipt that only exists in this
        // process is not a receipt.
        durable: databaseConfigured
          ? { decisionsRecorded: Boolean(durableDecisions?.ok), signed: durableSigned }
          : { decisionsRecorded: false, signed: false, reason: "database not configured" },
      },
      { status: result.idempotentReplay ? 200 : 201 }
    );
  } catch (err) {
    if (err instanceof NotAuthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnknownItemsError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof IncompleteReviewError) {
      // The clinician has not ruled on everything promotable. Refusing is the
      // point: an unread packet must not promote itself.
      return NextResponse.json(
        { error: err.message, undecided: err.undecided }, { status: 422 }
      );
    }
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.message, state: session.state }, { status: 409 });
    }
    if (err instanceof IntegrationUnavailableError) {
      // Pilot mode: surface the failure. Never claim a finalization we did not do.
      return NextResponse.json(
        { error: err.message, integration: err.integration, mode: "pilot" },
        { status: 503 }
      );
    }
    console.error("[approve] failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
