/**
 * Actor identity and server-enforced authorization.
 *
 * Until now every route was anonymous: the clinician id arrived in the request
 * body (the browser literally sent a hard-coded "practitioner-osei"), the voice
 * token endpoints would mint provider access for anyone who asked, and any
 * caller could drive any session. A display name is not proof of identity, and
 * a value the client chooses is not authorization.
 *
 * This module issues and verifies SIGNED, short-lived actor tokens. Two kinds:
 *
 *   patient   — scoped to exactly one patient AND one appointment. This is the
 *               signed-invitation model: the link itself is the credential, so
 *               it must be narrow and must expire.
 *   clinician — scoped to a tenant and a role.
 *
 * The signature is HMAC-SHA256 over the encoded claims. It is deliberately not
 * a bearer token the browser can mint or edit: everything security-relevant is
 * inside the signed payload, and the secret never leaves the server.
 *
 * WHAT THIS IS NOT: an identity provider. It enforces authorization and carries
 * a proven identity; it does not by itself PROVE the human is who they claim.
 * Clinician tokens must be issued from a real IdP (Medplum OAuth/SMART) before
 * production, and `assertAuthConfigured()` refuses pilot mode without one.
 */

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { runtimeMode } from "./runtime";

export type ActorRole = "patient" | "clinician" | "operator";

export interface Actor {
  /** Stable identity claim from the issuing authority. */
  subject: string;
  role: ActorRole;
  tenant: string;
  /** Patient tokens only: the single patient this actor may touch. */
  patientRef?: string;
  /** Patient tokens only: the single appointment this intake is for. */
  appointmentRef?: string;
  /** Seconds since epoch. */
  exp: number;
  /** Unique per issuance, so a token can be identified in an audit trail. */
  jti: string;
}

export class NotAuthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "authentication required") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "not permitted") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const AUTH_COOKIE = "prologue_actor";

const secret = process.env.PROLOGUE_SESSION_SECRET;
export const authConfigured = Boolean(secret && secret.length >= 32);

/**
 * Startup gate.
 *
 * Production must never run with an unsigned or weakly-signed session layer —
 * a guessable secret means anyone can mint a clinician token, which is
 * indistinguishable from having no authorization at all.
 */
export function assertAuthConfigured(): void {
  if (authConfigured) return;
  if (runtimeMode() === "pilot") {
    throw new NotAuthenticatedError(
      "PROLOGUE_SESSION_SECRET (>=32 chars) is required in pilot mode. Refusing to run with " +
        "unsigned actor tokens: anyone could mint clinician authority."
    );
  }
}

/* ------------------------------------------------------------------ */
/* Token format                                                        */
/* ------------------------------------------------------------------ */

function b64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret ?? "insecure-development-secret").update(payload).digest());
}

export interface IssueOptions {
  subject: string;
  role: ActorRole;
  tenant: string;
  patientRef?: string;
  appointmentRef?: string;
  /** Default 2h. Patient invitations should be shorter than clinician sessions. */
  ttlSeconds?: number;
}

export function issueToken(opts: IssueOptions): { token: string; actor: Actor } {
  const actor: Actor = {
    subject: opts.subject,
    role: opts.role,
    tenant: opts.tenant,
    patientRef: opts.patientRef,
    appointmentRef: opts.appointmentRef,
    exp: Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 2 * 60 * 60),
    jti: randomUUID(),
  };
  const payload = b64url(Buffer.from(JSON.stringify(actor)));
  return { token: `${payload}.${sign(payload)}`, actor };
}

/**
 * Verify a token.
 *
 * Rejects a bad signature, a tampered payload, and an expired token. The
 * signature comparison is constant-time — a timing-variable compare on a
 * security token is a real, well-known leak.
 */
export function verifyToken(token: string | undefined | null): Actor | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(payload);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let actor: Actor;
  try {
    actor = JSON.parse(unb64url(payload).toString("utf8")) as Actor;
  } catch {
    return null;
  }
  if (!actor?.subject || !actor?.role || !actor?.tenant) return null;
  if (typeof actor.exp !== "number" || actor.exp * 1000 < Date.now()) return null;
  return actor;
}

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The actor on this request, or null. Never throws — callers decide policy. */
export function actorFrom(req: Request): Actor | null {
  const bearer = req.headers.get("authorization");
  const fromHeader = bearer?.startsWith("Bearer ") ? bearer.slice(7) : undefined;
  return verifyToken(fromHeader ?? readCookie(req, AUTH_COOKIE));
}

/**
 * Demo-mode fallback actor.
 *
 * Demo must stay runnable without an IdP, but that must never look like
 * authorization succeeding. This returns a clearly-labelled anonymous actor and
 * ONLY in demo; pilot has no path here.
 */
function demoActor(role: ActorRole): Actor {
  return {
    subject: `demo-anonymous-${role}`,
    role,
    tenant: process.env.PROLOGUE_TENANT_SLUG || "prologue-demo",
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "demo",
  };
}

/** Did the caller present a credential at all, valid or not? */
function credentialPresented(req: Request): boolean {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && bearer.length > 7) return true;
  return Boolean(readCookie(req, AUTH_COOKIE));
}

export function requireActor(req: Request, role?: ActorRole): Actor {
  const actor = actorFrom(req);
  if (!actor) {
    /*
     * A PRESENTED credential that fails to verify is an authentication
     * FAILURE, never an absence of credentials.
     *
     * Conflating the two was a real hole: a tampered token verified to null,
     * fell through to the demo fallback, and was served as an anonymous
     * CLINICIAN — which skips patient scoping entirely. A forged token was
     * therefore more powerful than no token. Caught by a live tamper probe
     * returning 200 where it should have returned 401.
     */
    if (credentialPresented(req)) {
      throw new NotAuthenticatedError("invalid or expired credential");
    }
    if (runtimeMode() === "pilot") throw new NotAuthenticatedError();
    /*
     * Demo, with NO credential offered: proceed as an explicitly anonymous
     * subject that shows up in every audit row as such. The default role is
     * the LEAST privileged one, so an unauthenticated caller cannot inherit
     * clinician reach simply because a route forgot to name a role.
     */
    return demoActor(role ?? "patient");
  }
  if (role && actor.role !== role) {
    throw new ForbiddenError(`this action requires the ${role} role`);
  }
  return actor;
}

/**
 * A patient actor may touch exactly one patient's session.
 *
 * Checked against the SESSION's patient reference, not against anything the
 * request asserts — otherwise the check would be the caller marking their own
 * homework.
 */
export function assertMayAccessPatient(actor: Actor, patientRef: string): void {
  if (actor.role === "clinician" || actor.role === "operator") return;

  /*
   * The demo's anonymous actor is permitted — in demo only.
   *
   * Demo has to stay runnable without an identity provider, but note what this
   * does NOT do: it never applies in pilot, and it is only ever reached when no
   * credential was offered at all. A presented-but-invalid token has already
   * been rejected upstream, so this is not a way to get in with a forged one.
   */
  if (isDemoActor(actor) && runtimeMode() !== "pilot") return;

  if (!actor.patientRef || actor.patientRef !== patientRef) {
    throw new ForbiddenError("this session belongs to a different patient");
  }
}

/** The unauthenticated demo subject, recognisable in code and in audit rows. */
export function isDemoActor(actor: Actor): boolean {
  return actor.jti === "demo" && actor.subject.startsWith("demo-anonymous-");
}

export function assertSameTenant(actor: Actor, tenant: string): void {
  if (actor.tenant !== tenant) {
    // 404-shaped at the route layer: existence itself is information.
    throw new ForbiddenError("resource is outside this tenant");
  }
}

/** Serialise the auth cookie. HTTP-only and SameSite=Lax by default. */
export function authCookie(token: string, maxAgeSeconds = 2 * 60 * 60): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearAuthCookie(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
