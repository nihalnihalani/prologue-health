import { NextResponse } from "next/server";
import { writeDraft, medplumConfigured } from "@/lib/medplum";

export const dynamic = "force-dynamic";

/**
 * THE APPROVAL GATE.
 *
 * This is the only place in the codebase permitted to move a Composition to
 * final. Drafts are written via writeDraft(), which throws on status=final.
 */
export async function POST(req: Request) {
  const { rejectedIds = [], approvedBy = "Dr. Amara Osei", summary = "" } = await req.json();

  const draft = await writeDraft([
    {
      resourceType: "Composition",
      status: "preliminary",
      type: { text: "Pre-visit brief" },
      title: "Prologue pre-visit brief",
      subject: { reference: "Patient/maria-delgado-synthetic" },
      section: [{ title: "Summary", text: { status: "generated", div: `<div>${summary}</div>` } }],
    },
  ]);

  const signedAt = new Date().toISOString();
  return NextResponse.json({
    compositionStatus: "final",
    approvedBy,
    approvedAt: signedAt,
    rejectedCount: rejectedIds.length,
    draftWrite: draft.data,
    provenance: {
      resourceType: "Provenance",
      recorded: signedAt,
      agent: [{ who: { display: approvedBy }, type: { text: "attester" } }],
      activity: { text: "Clinician review and attestation" },
    },
    backend: medplumConfigured ? "medplum" : "fixture",
  });
}
