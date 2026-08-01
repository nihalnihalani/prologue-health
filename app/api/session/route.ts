import { NextResponse } from "next/server";
import { putSession, getSession, latestSession, listSessions } from "@/lib/store";
import type { StoryMap } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Patient view pushes the story map here after every turn. */
export async function POST(req: Request) {
  try {
    const map = (await req.json()) as StoryMap;
    if (!map?.sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const r = putSession(map);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/**
 * Clinician view pulls from here.
 *   ?id=...    a specific session
 *   ?list=1    everything waiting, newest first
 *   (neither)  the most recently updated session
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("list")) {
    return NextResponse.json({
      sessions: listSessions().map((s) => ({
        id: s.id,
        updatedAt: s.updatedAt,
        patient: s.map.patient.name,
        locale: s.map.locale,
        escalated: Boolean(s.map.escalation),
        status: s.map.compositionStatus,
      })),
    });
  }

  const id = url.searchParams.get("id");
  if (id) {
    const map = getSession(id);
    return map
      ? NextResponse.json({ map })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const latest = latestSession();
  return latest
    ? NextResponse.json({ map: latest.map, updatedAt: latest.updatedAt })
    : NextResponse.json({ map: null });
}
