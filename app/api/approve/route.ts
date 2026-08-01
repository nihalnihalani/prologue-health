import { NextResponse } from "next/server";
import { getSession, putSession } from "@/lib/store";
import {
  approveIntake,
  NotAuthorizedError,
  UnknownItemsError,
  IncompleteReviewError,
  InvalidTransitionError,
  type ItemDecision,
} from "@/lib/intake";
import { IntegrationUnavailableError, runtimeMode } from "@/lib/runtime";

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
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }

  try {
    const result = await approveIntake(session, {
      sessionId,
      clinicianId,
      clinicianSecret,
      decisions,
    });
    putSession(session);

    return NextResponse.json(
      {
        sessionId: result.sessionId,
        state: result.state,
        compositionStatus: session.map.compositionStatus,
        signature: result.signature,
        idempotentReplay: result.idempotentReplay,
        warnings: result.warnings,
        mode: runtimeMode(),
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
