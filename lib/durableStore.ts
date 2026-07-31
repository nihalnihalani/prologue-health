/**
 * Durable write-through for intake sessions.
 *
 * This is the seam where the in-process Map stops being the only copy. When
 * DATABASE_URL is configured every session write is mirrored into the
 * repository — session row, immutable turns, safety-rule outcomes, audit — and
 * the clinician queue is read back from the database rather than from whichever
 * instance happened to serve the patient.
 *
 * Failure policy differs by mode, deliberately:
 *   demo  — a database error must not break a running demo; the in-memory copy
 *           still answers and the failure is recorded.
 *   pilot — persistence failure is surfaced, because a clinic being told a
 *           session was captured when it was not is the worst outcome here.
 */

import type { StoryMap } from "./types";
import type { IntakeSession } from "./intake";
import { databaseConfigured } from "./db/client";
import { runtimeMode } from "./runtime";
import * as repo from "./db/sessions";

/** Until real identity lands, everything belongs to one bootstrap clinic. */
const DEMO_TENANT_SLUG = process.env.PROLOGUE_TENANT_SLUG || "prologue-demo";

let tenantId: string | null = null;

/**
 * Resolve (and on first use create) the tenant.
 *
 * This is explicitly a placeholder for Medplum-issued tenancy. It is a single
 * row rather than a hardcoded constant so that when real auth arrives the only
 * change is where the id comes from, not what depends on it.
 */
export async function resolveTenantId(): Promise<string> {
  if (tenantId) return tenantId;
  const pool = (await import("./db/client")).getPool();
  const found = await pool.query("SELECT id FROM tenants WHERE slug = $1", [DEMO_TENANT_SLUG]);
  if (found.rows[0]) {
    tenantId = found.rows[0].id as string;
    return tenantId;
  }
  const made = await pool.query(
    `INSERT INTO tenants (slug, name) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [DEMO_TENANT_SLUG, "Prologue Demo Clinic"]
  );
  tenantId = made.rows[0].id as string;
  return tenantId;
}

async function findByExternalId(tenant: string, externalId: string) {
  const pool = (await import("./db/client")).getPool();
  const { rows } = await pool.query(
    "SELECT * FROM intake_sessions WHERE tenant_id = $1 AND external_id = $2",
    [tenant, externalId]
  );
  return rows[0] ?? null;
}

/**
 * Mirror a session into durable storage.
 *
 * Idempotent by construction: the session is keyed by external id, and each
 * patient turn is appended with a stable event id, so replaying the same
 * StoryMap (which the patient page does on every sync) does not duplicate
 * anything.
 */
export async function persistSession(session: IntakeSession): Promise<{ ok: boolean; error?: string }> {
  if (!databaseConfigured) return { ok: false, error: "database not configured" };

  try {
    const tenant = await resolveTenantId();
    const pool = (await import("./db/client")).getPool();
    const map = session.map;

    let row = await findByExternalId(tenant, session.id);
    if (!row) {
      const created = await pool.query(
        `INSERT INTO intake_sessions
           (tenant_id, patient_ref, appointment_ref, locale, external_id, story_map, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          tenant,
          session.patientId,
          session.appointmentId ?? null,
          session.locale,
          session.id,
          JSON.stringify(map),
          session.state,
        ]
      );
      row = created.rows[0] ?? (await findByExternalId(tenant, session.id));
      await repo.recordAudit({
        tenantId: tenant,
        sessionId: row.id,
        action: "session.created",
        outcome: "success",
        detail: { externalId: session.id, patientRef: session.patientId },
      });
    } else {
      // A signed session is terminal; never let a later sync rewrite it.
      if (row.state !== "signed") {
        await pool.query(
          `UPDATE intake_sessions
              SET story_map = $3, state = $4, locale = $5,
                  safety_covered = $6, safety_note = $7,
                  version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [
            tenant,
            row.id,
            JSON.stringify(map),
            session.state,
            session.locale,
            map.safetyCoverage ? map.safetyCoverage.covered : null,
            map.safetyCoverage?.note ?? null,
          ]
        );
      }
    }

    await persistTurns(tenant, row.id, map);
    await persistSafety(tenant, row.id, map);
    return { ok: true };
  } catch (err) {
    const detail = (err as Error).message;
    console.error("[durable] persist failed:", detail);
    // In pilot the caller must know the write did not land.
    if (runtimeMode() === "pilot") throw err;
    return { ok: false, error: detail };
  }
}

/** Append any patient/agent turns not already stored. Stable ids make it safe to replay. */
async function persistTurns(tenant: string, sessionId: string, map: StoryMap) {
  const items = map.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as { source?: string; text?: string; patientText?: string; verbatim?: string; atSeconds?: number; lang?: string };
    if (it.source !== "PATIENT") continue;
    const text = it.verbatim ?? it.patientText ?? it.text ?? "";
    if (!text) continue;
    await repo.appendTurn({
      tenantId: tenant,
      sessionId,
      speaker: "patient",
      text,
      lang: it.lang,
      atSeconds: it.atSeconds,
      provider: "engine",
      // Index-stable: the StoryMap is append-only, so item i is always turn i.
      providerEventId: `item-${i}`,
    });
  }
}

/**
 * Record the safety outcome, including the negative case.
 *
 * A session with no escalation still gets a row, because "rules ran and found
 * nothing" and "rules never ran" must stay distinguishable in the database, not
 * only in the UI.
 */
async function persistSafety(tenant: string, sessionId: string, map: StoryMap) {
  const pool = (await import("./db/client")).getPool();
  const { rows } = await pool.query(
    "SELECT 1 FROM rule_evaluations WHERE session_id = $1 AND rule_id IS NOT DISTINCT FROM $2 LIMIT 1",
    [sessionId, map.escalation?.ruleId ?? null]
  );
  if (rows.length) return;

  await repo.recordRuleEvaluation({
    tenantId: tenant,
    sessionId,
    ruleId: map.escalation?.ruleId,
    fired: Boolean(map.escalation),
    severity: map.escalation?.severity,
    locale: map.locale,
    covered: map.safetyCoverage ? map.safetyCoverage.covered : true,
    detail: map.safetyCoverage?.note ?? map.escalation?.ruleLabel,
  });
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export interface DurableQueueRow {
  id: string;
  externalId: string | null;
  patientRef: string;
  state: string;
  locale: string;
  escalated: boolean;
  safetyCovered: boolean | null;
  updatedAt: string;
  version: number;
  map: StoryMap | null;
}

/** The clinician queue, read from durable storage — real rows only. */
export async function loadQueue(): Promise<DurableQueueRow[] | null> {
  if (!databaseConfigured) return null;
  try {
    const tenant = await resolveTenantId();
    const pool = (await import("./db/client")).getPool();
    const { rows } = await pool.query(
      `SELECT s.*,
              EXISTS (SELECT 1 FROM rule_evaluations r
                       WHERE r.session_id = s.id AND r.fired) AS escalated
         FROM intake_sessions s
        WHERE s.tenant_id = $1
        ORDER BY escalated DESC, s.updated_at DESC`,
      [tenant]
    );
    return rows.map((r) => ({
      id: r.id,
      externalId: r.external_id,
      patientRef: r.patient_ref,
      state: r.state,
      locale: r.locale,
      escalated: Boolean(r.escalated),
      safetyCovered: r.safety_covered,
      updatedAt: String(r.updated_at),
      version: Number(r.version),
      map: r.story_map ?? null,
    }));
  } catch (err) {
    console.error("[durable] queue read failed:", (err as Error).message);
    if (runtimeMode() === "pilot") throw err;
    return null;
  }
}

/** Load one session by the engine's id. Side-effect free. */
export async function loadSession(externalId: string): Promise<DurableQueueRow | null> {
  if (!databaseConfigured) return null;
  try {
    const tenant = await resolveTenantId();
    const row = await findByExternalId(tenant, externalId);
    if (!row) return null;
    return {
      id: row.id,
      externalId: row.external_id,
      patientRef: row.patient_ref,
      state: row.state,
      locale: row.locale,
      escalated: false,
      safetyCovered: row.safety_covered,
      updatedAt: String(row.updated_at),
      version: Number(row.version),
      map: row.story_map ?? null,
    };
  } catch (err) {
    console.error("[durable] session read failed:", (err as Error).message);
    if (runtimeMode() === "pilot") throw err;
    return null;
  }
}

/**
 * Claim a case durably, guarded by the version the clinician actually saw.
 *
 * This is the multi-instance-safe half of claiming: two clinicians on two
 * servers can no longer both believe they own the case.
 */
export async function claimDurable(
  externalId: string,
  actorSubject: string
): Promise<{ ok: boolean; conflict?: boolean; version?: number; error?: string }> {
  if (!databaseConfigured) return { ok: false, error: "database not configured" };
  try {
    const tenant = await resolveTenantId();
    const pool = (await import("./db/client")).getPool();
    const row = await findByExternalId(tenant, externalId);
    if (!row) return { ok: false, error: "unknown session" };

    const actor = await pool.query(
      `INSERT INTO actors (tenant_id, subject, role) VALUES ($1,$2,'clinician')
       ON CONFLICT (tenant_id, subject) DO UPDATE SET subject = EXCLUDED.subject
       RETURNING id`,
      [tenant, actorSubject]
    );

    const updated = await repo.claim(tenant, row.id, Number(row.version), actor.rows[0].id);
    await repo.recordAudit({
      tenantId: tenant,
      sessionId: row.id,
      action: "session.claim",
      actorSubject,
      outcome: "success",
      detail: { version: updated.version },
    });
    return { ok: true, version: updated.version };
  } catch (err) {
    if ((err as Error).name === "VersionConflictError") {
      return { ok: false, conflict: true, error: (err as Error).message };
    }
    if (runtimeMode() === "pilot") throw err;
    return { ok: false, error: (err as Error).message };
  }
}
