import { NextResponse } from "next/server";
import {
  issueToken,
  actorFrom,
  authCookie,
  clearAuthCookie,
  authConfigured,
  assertAuthConfigured,
} from "@/lib/auth";
import { runtimeMode } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/**
 * Actor session issuance.
 *
 * IMPORTANT — what this is and is not.
 *
 * The AUTHORIZATION layer here is real: tokens are HMAC-signed server-side,
 * scoped, expiring, and enforced by every route that touches PHI. What is NOT
 * yet real is the AUTHENTICATION source for clinicians. Proving that a human is
 * a particular practitioner requires an identity provider — Medplum OAuth/SMART
 * is the intended one — and this route deliberately refuses to invent that
 * proof.
 *
 *   demo   — issues a labelled development session so the product is runnable.
 *   pilot  — refuses. A clinic must not be able to obtain clinician authority
 *            from an endpoint that asked them for nothing.
 *
 * Patient invitations are different and ARE production-shaped: the signed link
 * IS the credential, scoped to one patient and one appointment with a short
 * expiry, which is the standard pattern for pre-visit intake.
 */

const PATIENT_INVITE_TTL = 30 * 60; // 30 minutes: a link is a bearer credential.

export async function GET(req: Request) {
  const actor = actorFrom(req);
  return NextResponse.json({
    authenticated: Boolean(actor),
    authConfigured,
    mode: runtimeMode(),
    actor: actor
      ? {
          subject: actor.subject,
          role: actor.role,
          tenant: actor.tenant,
          patientRef: actor.patientRef ?? null,
          appointmentRef: actor.appointmentRef ?? null,
          expiresAt: new Date(actor.exp * 1000).toISOString(),
        }
      : null,
  });
}

export async function POST(req: Request) {
  let body: { action?: string; patientRef?: string; appointmentRef?: string; subject?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    assertAuthConfigured();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }

  const tenant = process.env.PROLOGUE_TENANT_SLUG || "prologue-demo";

  if (body.action === "invite") {
    /*
     * A patient invitation is a bearer credential in a URL, so it is issued as
     * narrowly as it can usefully be: one patient, one appointment, 30 minutes.
     * Widening any of those widens what a forwarded or logged link grants.
     */
    if (!body.patientRef) {
      return NextResponse.json({ error: "patientRef is required" }, { status: 400 });
    }
    const { token, actor } = issueToken({
      subject: `patient:${body.patientRef}`,
      role: "patient",
      tenant,
      patientRef: body.patientRef,
      appointmentRef: body.appointmentRef,
      ttlSeconds: PATIENT_INVITE_TTL,
    });
    return NextResponse.json(
      { token, expiresAt: new Date(actor.exp * 1000).toISOString(), scope: "single patient + appointment" },
      { headers: { "Set-Cookie": authCookie(token, PATIENT_INVITE_TTL) } }
    );
  }

  if (body.action === "clinician") {
    if (runtimeMode() === "pilot") {
      // The blocker, stated where someone will actually hit it.
      return NextResponse.json(
        {
          error:
            "clinician sessions require a real identity provider in pilot mode. Configure Medplum " +
            "OAuth/SMART; this endpoint will not issue clinician authority without proof of identity.",
        },
        { status: 501 }
      );
    }
    const { token, actor } = issueToken({
      // Labelled so it can never be mistaken for a verified practitioner in an
      // audit trail.
      subject: body.subject ? `dev:${body.subject}` : "dev:unverified-clinician",
      role: "clinician",
      tenant,
    });
    return NextResponse.json(
      {
        token,
        expiresAt: new Date(actor.exp * 1000).toISOString(),
        warning: "development session — identity is NOT verified",
      },
      { headers: { "Set-Cookie": authCookie(token) } }
    );
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearAuthCookie() } });
}
