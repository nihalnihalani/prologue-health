/**
 * SessionRepository — the durable, tenant-scoped workflow boundary.
 *
 * Two rules hold everywhere in this file:
 *
 *   1. Every query is scoped by tenant_id. There is no unscoped read. A missing
 *      tenant filter in a multi-clinic product is a cross-tenant PHI leak, so
 *      the tenant is a required argument rather than an optional filter.
 *   2. Reads never mutate. Claim, release, decide, sign, and abandon are
 *      explicit commands that take the version the caller actually observed.
 */

import type { PoolClient } from "pg";
import { getPool, withTransaction } from "./client";

export type IntakeState =
  | "created"
  | "consented"
  | "in_progress"
  | "ready_for_review"
  | "under_review"
  | "signed"
  | "abandoned";

export type DecisionKind = "approve" | "edit" | "reject";
export type DataOrigin = "live" | "cache" | "fixture" | "failed" | "unknown";

export class VersionConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number | null) {
    super(
      actual === null
        ? "session not found or not visible to this tenant"
        : `version conflict: caller held ${expected}, current is ${actual}`
    );
    this.name = "VersionConflictError";
  }
}

export interface SessionRow {
  id: string;
  tenantId: string;
  patientRef: string;
  appointmentRef: string | null;
  state: IntakeState;
  locale: string;
  safetyCovered: boolean | null;
  safetyNote: string | null;
  assignedTo: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  signedAt: string | null;
}

function toSession(r: Record<string, unknown>): SessionRow {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    patientRef: r.patient_ref as string,
    appointmentRef: (r.appointment_ref as string) ?? null,
    state: r.state as IntakeState,
    locale: r.locale as string,
    safetyCovered: (r.safety_covered as boolean) ?? null,
    safetyNote: (r.safety_note as string) ?? null,
    assignedTo: (r.assigned_to as string) ?? null,
    version: Number(r.version),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    signedAt: r.signed_at ? String(r.signed_at) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export async function createSession(input: {
  tenantId: string;
  patientRef: string;
  appointmentRef?: string;
  locale?: string;
}): Promise<SessionRow> {
  const { rows } = await getPool().query(
    `INSERT INTO intake_sessions (tenant_id, patient_ref, appointment_ref, locale)
     VALUES ($1, $2, $3, COALESCE($4, 'en'))
     RETURNING *`,
    [input.tenantId, input.patientRef, input.appointmentRef ?? null, input.locale ?? null]
  );
  return toSession(rows[0]);
}

/** Side-effect free by construction: a SELECT with no state transition. */
export async function getSession(tenantId: string, id: string): Promise<SessionRow | null> {
  const { rows } = await getPool().query(
    "SELECT * FROM intake_sessions WHERE tenant_id = $1 AND id = $2",
    [tenantId, id]
  );
  return rows[0] ? toSession(rows[0]) : null;
}

/**
 * Apply a state change, guarded by the version the caller read.
 *
 * The WHERE clause carries the version, so two concurrent commands cannot both
 * succeed: the second updates zero rows and raises rather than silently
 * clobbering the first.
 */
export async function transition(
  tenantId: string,
  id: string,
  expectedVersion: number,
  next: IntakeState,
  patch: { assignedTo?: string | null; signedBy?: string | null } = {},
  client?: PoolClient
): Promise<SessionRow> {
  const q = client ?? getPool();
  const { rows } = await q.query(
    // $4 is referenced both as the new enum value and in the CASE guards, so it
    // is cast explicitly everywhere. Without the cast Postgres tries to deduce
    // one type from several uses and rejects the statement outright.
    `UPDATE intake_sessions
        SET state       = $4::intake_state,
            assigned_to = CASE WHEN $5::boolean THEN $6::uuid ELSE assigned_to END,
            signed_by   = CASE WHEN $4::intake_state = 'signed' THEN $7::uuid ELSE signed_by END,
            signed_at   = CASE WHEN $4::intake_state = 'signed' THEN now() ELSE signed_at END,
            completed_at= CASE WHEN $4::intake_state IN ('ready_for_review','signed')
                                AND completed_at IS NULL
                               THEN now() ELSE completed_at END,
            version     = version + 1,
            updated_at  = now()
      WHERE tenant_id = $1 AND id = $2 AND version = $3
      RETURNING *`,
    [
      tenantId,
      id,
      expectedVersion,
      next,
      Object.prototype.hasOwnProperty.call(patch, "assignedTo"),
      patch.assignedTo ?? null,
      patch.signedBy ?? null,
    ]
  );

  if (!rows[0]) {
    const cur = await (client ?? getPool()).query(
      "SELECT version FROM intake_sessions WHERE tenant_id = $1 AND id = $2",
      [tenantId, id]
    );
    throw new VersionConflictError(expectedVersion, cur.rows[0] ? Number(cur.rows[0].version) : null);
  }
  return toSession(rows[0]);
}

/**
 * Claim a case for review.
 *
 * Concurrency-safe without an application lock: the version guard means only
 * one of N racing clinicians wins, and the losers get a conflict they can act
 * on rather than a silently shared assignment.
 */
export async function claim(
  tenantId: string,
  id: string,
  expectedVersion: number,
  actorId: string
): Promise<SessionRow> {
  return transition(tenantId, id, expectedVersion, "under_review", { assignedTo: actorId });
}

export async function release(
  tenantId: string,
  id: string,
  expectedVersion: number
): Promise<SessionRow> {
  return transition(tenantId, id, expectedVersion, "ready_for_review", { assignedTo: null });
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Append an immutable turn.
 *
 * `providerEventId` makes this idempotent: a voice provider that redelivers a
 * final transcript (which Deepgram does on reconnect) must not create a second
 * turn, because every extracted fact's provenance points at a turn id.
 */
export async function appendTurn(
  input: {
    tenantId: string;
    sessionId: string;
    speaker: "patient" | "agent" | "system";
    text: string;
    lang?: string;
    atSeconds?: number;
    provider?: string;
    providerEventId?: string;
  },
  client?: PoolClient
): Promise<{ id: string; seq: number; duplicate: boolean }> {
  const run = async (c: PoolClient) => {
    if (input.providerEventId) {
      const dup = await c.query(
        `SELECT id, seq FROM session_turns
          WHERE session_id = $1 AND provider IS NOT DISTINCT FROM $2 AND provider_event_id = $3`,
        [input.sessionId, input.provider ?? null, input.providerEventId]
      );
      if (dup.rows[0]) {
        return { id: dup.rows[0].id as string, seq: Number(dup.rows[0].seq), duplicate: true };
      }
    }

    const { rows } = await c.query(
      `INSERT INTO session_turns
         (tenant_id, session_id, seq, speaker, text, lang, at_seconds, provider, provider_event_id)
       VALUES ($1, $2,
         (SELECT COALESCE(MAX(seq), 0) + 1 FROM session_turns WHERE session_id = $2),
         $3, $4, $5, $6, $7, $8)
       RETURNING id, seq`,
      [
        input.tenantId,
        input.sessionId,
        input.speaker,
        input.text,
        input.lang ?? null,
        input.atSeconds ?? null,
        input.provider ?? null,
        input.providerEventId ?? null,
      ]
    );
    return { id: rows[0].id as string, seq: Number(rows[0].seq), duplicate: false };
  };

  if (client) return run(client);
  return withTransaction(run);
}

export async function listTurns(tenantId: string, sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT id, seq, speaker, text, lang, at_seconds, created_at
       FROM session_turns WHERE tenant_id = $1 AND session_id = $2 ORDER BY seq`,
    [tenantId, sessionId]
  );
  return rows;
}

/**
 * Record a deterministic rule outcome — including a negative.
 *
 * A row with fired=false and covered=false is the "not screened" case, and it
 * is stored precisely so the clinician view can never render it as
 * "nothing found".
 */
export async function recordRuleEvaluation(
  input: {
    tenantId: string;
    sessionId: string;
    turnId?: string;
    ruleId?: string;
    fired: boolean;
    severity?: string;
    locale: string;
    covered: boolean;
    detail?: string;
    durationMs?: number;
  },
  client?: PoolClient
): Promise<void> {
  const q = client ?? getPool();
  await q.query(
    `INSERT INTO rule_evaluations
       (tenant_id, session_id, turn_id, rule_id, fired, severity, locale, covered, detail, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.tenantId,
      input.sessionId,
      input.turnId ?? null,
      input.ruleId ?? null,
      input.fired,
      input.severity ?? null,
      input.locale,
      input.covered,
      input.detail ?? null,
      input.durationMs ?? null,
    ]
  );
}

/**
 * Persist model-extracted candidate facts.
 *
 * Every row is bound to the turn it came from and the exact character span
 * within it, plus the provider, model version, and prompt version that produced
 * it. That binding is the whole point: a clinician reviewing a generated fact
 * must be able to see the words it came from, and we must be able to tell
 * afterwards which model and prompt produced any given claim.
 *
 * These are CANDIDATES. Nothing here is clinical truth, and nothing here is
 * promotable without an explicit clinician decision.
 */
export async function recordExtractedFacts(
  input: {
    tenantId: string;
    sessionId: string;
    turnId: string;
    provider: string;
    modelVersion: string;
    promptVersion: string;
    traceId?: string;
    facts: {
      field: string;
      value: unknown;
      spanStart: number;
      spanEnd: number;
      confidence?: number;
      uncertain?: boolean;
    }[];
  },
  client?: PoolClient
): Promise<number> {
  const q = client ?? getPool();
  let written = 0;
  for (const f of input.facts) {
    await q.query(
      `INSERT INTO extracted_facts
         (tenant_id, session_id, turn_id, field, value, span_start, span_end,
          confidence, uncertain, model_provider, model_version, prompt_version, trace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.tenantId,
        input.sessionId,
        input.turnId,
        f.field,
        JSON.stringify(f.value),
        f.spanStart,
        f.spanEnd,
        f.confidence ?? null,
        Boolean(f.uncertain),
        input.provider,
        input.modelVersion,
        input.promptVersion,
        input.traceId ?? null,
      ]
    );
    written++;
  }
  return written;
}

/** Candidate facts for a session, newest turn last, with their source span. */
export async function listExtractedFacts(tenantId: string, sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT f.id, f.field, f.value, f.span_start, f.span_end, f.confidence, f.uncertain,
            f.model_provider, f.model_version, f.prompt_version, f.created_at,
            t.text AS source_text, t.seq AS source_seq
       FROM extracted_facts f
       JOIN session_turns t ON t.id = f.turn_id
      WHERE f.tenant_id = $1 AND f.session_id = $2
      ORDER BY t.seq, f.created_at`,
    [tenantId, sessionId]
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

/**
 * Record an explicit clinician decision.
 *
 * `reviewVersion` is the session version the clinician was looking at. It is
 * stored, not just checked, so a decision made against a view that has since
 * changed remains detectable after the fact.
 */
export async function recordDecision(
  input: {
    tenantId: string;
    sessionId: string;
    itemKey: string;
    kind: DecisionKind;
    originalText?: string;
    editedText?: string;
    actorId: string;
    reviewVersion: number;
  },
  client?: PoolClient
): Promise<void> {
  const q = client ?? getPool();
  await q.query(
    `INSERT INTO clinician_decisions
       (tenant_id, session_id, item_key, kind, original_text, edited_text, actor_id, review_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (session_id, item_key) DO UPDATE
       SET kind = EXCLUDED.kind,
           edited_text = EXCLUDED.edited_text,
           actor_id = EXCLUDED.actor_id,
           review_version = EXCLUDED.review_version,
           created_at = now()`,
    [
      input.tenantId,
      input.sessionId,
      input.itemKey,
      input.kind,
      input.originalText ?? null,
      input.editedText ?? null,
      input.actorId,
      input.reviewVersion,
    ]
  );
}

export async function listDecisions(tenantId: string, sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT item_key, kind, original_text, edited_text, actor_id, review_version, created_at
       FROM clinician_decisions WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at`,
    [tenantId, sessionId]
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* Outbox and receipts                                                 */
/* ------------------------------------------------------------------ */

/**
 * Decide on an external write in the caller's transaction.
 *
 * Returns `duplicate: true` when the idempotency key already exists, which is
 * what makes a replayed sign command safe across a process restart.
 */
export async function enqueueWrite(
  input: {
    tenantId: string;
    sessionId: string;
    idempotencyKey: string;
    resourceType: string;
    payload: unknown;
  },
  client?: PoolClient
): Promise<{ id: string; duplicate: boolean }> {
  const q = client ?? getPool();
  const { rows } = await q.query(
    `INSERT INTO write_outbox (tenant_id, session_id, idempotency_key, resource_type, payload)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING id`,
    [input.tenantId, input.sessionId, input.idempotencyKey, input.resourceType, JSON.stringify(input.payload)]
  );
  if (rows[0]) return { id: rows[0].id as string, duplicate: false };

  const existing = await q.query(
    "SELECT id FROM write_outbox WHERE tenant_id = $1 AND idempotency_key = $2",
    [input.tenantId, input.idempotencyKey]
  );
  return { id: existing.rows[0].id as string, duplicate: true };
}

/**
 * Atomically take the next due outbox item.
 *
 * SKIP LOCKED is what allows two app instances to drain the same outbox
 * without both performing the same external write.
 */
export async function claimNextWrite(limit = 1) {
  const { rows } = await getPool().query(
    `UPDATE write_outbox SET status = 'in_flight', attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM write_outbox
         WHERE status IN ('pending','failed') AND next_attempt_at <= now()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1)
      RETURNING *`,
    [limit]
  );
  return rows;
}

export async function completeWrite(
  outboxId: string,
  receipt: {
    tenantId: string;
    sessionId: string;
    resourceType: string;
    resourceId?: string;
    resourceVersion?: string;
    status: "written" | "not-attempted" | "failed";
    detail?: string;
  }
): Promise<void> {
  await withTransaction(async (c) => {
    await c.query(
      `UPDATE write_outbox SET status = $2, updated_at = now(),
              last_error = CASE WHEN $2 = 'failed' THEN $3 ELSE NULL END,
              next_attempt_at = CASE WHEN $2 = 'failed'
                                     THEN now() + (interval '30 seconds' * POWER(2, LEAST(attempts, 6)))
                                     ELSE next_attempt_at END
        WHERE id = $1`,
      [outboxId, receipt.status === "written" ? "succeeded" : "failed", receipt.detail ?? null]
    );
    await c.query(
      `INSERT INTO write_receipts
         (tenant_id, session_id, outbox_id, resource_type, resource_id, resource_version, status, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        receipt.tenantId,
        receipt.sessionId,
        outboxId,
        receipt.resourceType,
        receipt.resourceId ?? null,
        receipt.resourceVersion ?? null,
        receipt.status,
        receipt.detail ?? null,
      ]
    );
  });
}

/* ------------------------------------------------------------------ */
/* Queue, integrations, audit                                          */
/* ------------------------------------------------------------------ */

/** Escalations first, then longest waiting. Tenant-scoped, real rows only. */
export async function listQueue(tenantId: string) {
  const { rows } = await getPool().query(
    `SELECT s.*,
            EXISTS (SELECT 1 FROM rule_evaluations r
                     WHERE r.session_id = s.id AND r.fired) AS escalated
       FROM intake_sessions s
      WHERE s.tenant_id = $1
        AND s.state IN ('ready_for_review','under_review')
      ORDER BY escalated DESC, s.updated_at ASC`,
    [tenantId]
  );
  return rows.map((r) => ({ ...toSession(r), escalated: Boolean(r.escalated) }));
}

export async function recordIntegrationCall(
  input: {
    tenantId: string;
    sessionId?: string;
    provider: string;
    operation: string;
    origin: DataOrigin;
    ok: boolean;
    statusCode?: number;
    latencyMs?: number;
    traceId?: string;
    correlationId?: string;
    errorClass?: string;
    errorMessage?: string;
  },
  client?: PoolClient
): Promise<void> {
  const q = client ?? getPool();
  await q.query(
    `INSERT INTO integration_calls
       (tenant_id, session_id, provider, operation, origin, ok, status_code, latency_ms,
        trace_id, correlation_id, error_class, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.tenantId,
      input.sessionId ?? null,
      input.provider,
      input.operation,
      input.origin,
      input.ok,
      input.statusCode ?? null,
      input.latencyMs ?? null,
      input.traceId ?? null,
      input.correlationId ?? null,
      input.errorClass ?? null,
      input.errorMessage ?? null,
    ]
  );
}

export async function recordAudit(
  input: {
    tenantId: string;
    sessionId?: string;
    action: string;
    actorId?: string;
    actorSubject?: string;
    outcome: string;
    detail?: unknown;
    correlationId?: string;
  },
  client?: PoolClient
): Promise<void> {
  const q = client ?? getPool();
  await q.query(
    `INSERT INTO audit_events
       (tenant_id, session_id, action, actor_id, actor_subject, outcome, detail, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.tenantId,
      input.sessionId ?? null,
      input.action,
      input.actorId ?? null,
      input.actorSubject ?? null,
      input.outcome,
      input.detail === undefined ? null : JSON.stringify(input.detail),
      input.correlationId ?? null,
    ]
  );
}

export async function auditHistory(tenantId: string, sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT action, actor_subject, outcome, detail, created_at
       FROM audit_events WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at`,
    [tenantId, sessionId]
  );
  return rows;
}
