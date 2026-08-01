import { NextResponse } from "next/server";
import { upsertFromMap, getSession, latestSession, listSessions, transition } from "@/lib/store";
import { InvalidTransitionError } from "@/lib/intake";
import { runtimeMode } from "@/lib/runtime";
import type { StoryMap } from "@/lib/types";
import { PATIENT_ID } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

/** Patient view pushes the clinical payload; the server derives the lifecycle. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StoryMap & { patientId?: string; appointmentId?: string };
    if (!body?.sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const session = upsertFromMap(body, {
      patientId: body.patientId ?? body.patient?.id ?? PATIENT_ID,
      appointmentId: body.appointmentId,
    });
    return NextResponse.json({
      ok: true,
      id: session.id,
      state: session.state,
      updatedAt: session.updatedAt,
      // A signed session is terminal; tell the client its write was not applied.
      accepted: session.state !== "signed" || session.map === body,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/**
 * Explicit lifecycle actions. Reads never mutate; this does.
 *   { sessionId, action: "claim" }   ready_for_review -> under_review
 *   { sessionId, action: "release" } under_review -> ready_for_review
 */
export async function PATCH(req: Request) {
  try {
    const { sessionId, action, clinicianId } = (await req.json()) as {
      sessionId?: string;
      action?: "claim" | "release";
      clinicianId?: string;
    };
    if (!sessionId || !action) {
      return NextResponse.json({ error: "sessionId and action are required" }, { status: 400 });
    }
    const existing = getSession(sessionId);
    if (!existing) return NextResponse.json({ error: "unknown session" }, { status: 404 });

    const to = action === "claim" ? "under_review" : "ready_for_review";
    const s = transition(sessionId, to);
    if (action === "claim" && clinicianId) s.assignedTo = clinicianId;
    if (action === "release") s.assignedTo = undefined;

    return NextResponse.json({ id: s.id, state: s.state, assignedTo: s.assignedTo ?? null });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/**
 *   ?id=...     a specific session
 *   ?queue=1    the clinician work queue, escalations first
 *   (neither)   most recently updated
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("queue")) {
    return NextResponse.json({
      mode: runtimeMode(),
      sessions: listSessions().map((s) => ({
        id: s.id,
        patientId: s.patientId,
        patient: s.map.patient.name,
        state: s.state,
        locale: s.locale,
        updatedAt: s.updatedAt,
        urgency: s.map.escalation?.severity ?? null,
        escalationRule: s.map.escalation?.ruleId ?? null,
        itemCount: s.map.items.length,
        signedBy: s.signature?.by ?? null,
      })),
    });
  }

  const id = url.searchParams.get("id");
  const session = id ? getSession(id) : latestSession();
  if (!session) return NextResponse.json({ session: null, mode: runtimeMode() });

  // READS ARE SIDE-EFFECT FREE.
  // This previously moved ready_for_review -> under_review on GET, so polling or
  // merely opening a link silently claimed a case. Claiming is now a deliberate
  // clinician action: PATCH /api/session with { action: "claim" }.

  return NextResponse.json({
    mode: runtimeMode(),
    session: {
      id: session.id,
      patientId: session.patientId,
      state: session.state,
      locale: session.locale,
      updatedAt: session.updatedAt,
      assignedTo: session.assignedTo ?? null,
      signature: session.signature ?? null,
    },
    map: session.map,
  });
}
