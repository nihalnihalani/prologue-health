import { NextResponse } from "next/server";
import { upsertFromMap, getSession, latestSession, listSessions, transition } from "@/lib/store";
import { InvalidTransitionError } from "@/lib/intake";
import { runtimeMode } from "@/lib/runtime";
import type { StoryMap } from "@/lib/types";
import { PATIENT_ID } from "@/lib/fixtures";
import { persistSession, loadQueue, loadSession, claimDurable } from "@/lib/durableStore";
import { databaseConfigured } from "@/lib/db/client";

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

    // Write through to durable storage. The in-memory copy still answers this
    // request; `durable` tells the caller honestly whether the session would
    // survive a restart, rather than implying persistence that did not happen.
    const persisted = await persistSession(session);

    return NextResponse.json({
      ok: true,
      id: session.id,
      state: session.state,
      updatedAt: session.updatedAt,
      durable: persisted.ok,
      durableError: persisted.ok ? undefined : persisted.error,
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

    // Durable claim first: it is the version-guarded one, so two clinicians on
    // two instances cannot both win. A conflict must surface as 409, not as a
    // silently shared case.
    if (action === "claim" && databaseConfigured) {
      const d = await claimDurable(sessionId, clinicianId ?? "unknown-clinician");
      if (d.conflict) {
        return NextResponse.json(
          { error: "session was claimed or changed by someone else", conflict: true },
          { status: 409 }
        );
      }
    }

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
    // Durable queue when available: a queue read from one instance's memory is
    // wrong the moment a second instance serves a patient.
    const durable = await loadQueue();
    if (durable) {
      return NextResponse.json({
        mode: runtimeMode(),
        source: "durable",
        sessions: durable.map((d) => ({
          id: d.externalId ?? d.id,
          patientId: d.patientRef,
          patient: d.map?.patient?.name ?? d.patientRef,
          state: d.state,
          locale: d.locale,
          updatedAt: d.updatedAt,
          version: d.version,
          reason: d.map?.patient?.appointment?.reason ?? null,
          urgency: d.map?.escalation?.severity ?? null,
          escalationRule: d.map?.escalation?.ruleId ?? null,
          itemCount: d.map?.items?.length ?? 0,
          safetyCovered: d.safetyCovered,
          escalated: d.escalated,
        })),
      });
    }

    return NextResponse.json({
      mode: runtimeMode(),
      source: "memory",
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

  if (!session) {
    // Memory lost it (restart, or a different instance). Durable storage is the
    // reason that is now recoverable instead of terminal.
    //
    // This also covers the NO-ID case: after a restart the in-process store is
    // empty, so "latest" used to return null while durable storage still held
    // every session. The clinician view then silently fell back to localStorage
    // and reported itself as LOCAL ONLY — showing a real queue beside a casefile
    // loaded from the browser. Falling back to the most recent durable session
    // keeps the rail and the open case describing the same world.
    if (!id) {
      const rows = await loadQueue();
      const newest = (rows ?? [])
        .filter((r) => r.map)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      if (newest) {
        return NextResponse.json({
          mode: runtimeMode(),
          source: "durable",
          session: {
            id: newest.externalId ?? newest.id,
            patientId: newest.patientRef,
            state: newest.state,
            locale: newest.locale,
            updatedAt: newest.updatedAt,
            version: newest.version,
            assignedTo: null,
          },
          map: newest.map,
        });
      }
    }

    if (id) {
      const d = await loadSession(id);
      if (d) {
        return NextResponse.json({
          mode: runtimeMode(),
          source: "durable",
          session: {
            id: d.externalId ?? d.id,
            patientId: d.patientRef,
            state: d.state,
            locale: d.locale,
            updatedAt: d.updatedAt,
            version: d.version,
            assignedTo: null,
          },
          // `map` is a SIBLING of `session`, matching every other branch. Nested
          // inside, the client's `j.map` check missed and it silently fell back
          // to localStorage — so selecting a case from the rail would quietly
          // show browser-cached data instead of the case that was clicked.
          map: d.map,
        });
      }
    }
    return NextResponse.json({ session: null, mode: runtimeMode() });
  }

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
