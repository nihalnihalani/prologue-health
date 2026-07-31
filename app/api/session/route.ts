import { NextResponse } from "next/server";
import { upsertFromMap, getSession, latestSession, listSessions, transition } from "@/lib/store";
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

  // Opening a queued session marks it under review.
  if (id && session.state === "ready_for_review") {
    try {
      transition(id, "under_review");
    } catch {
      /* benign race */
    }
  }

  return NextResponse.json({
    mode: runtimeMode(),
    session: {
      id: session.id,
      patientId: session.patientId,
      state: session.state,
      locale: session.locale,
      updatedAt: session.updatedAt,
      signature: session.signature ?? null,
    },
    map: session.map,
  });
}
