-- Prologue durable control plane — initial schema.
--
-- Scope split, deliberately: Medplum remains the clinical source of truth for
-- FHIR resources. This database owns APPLICATION WORKFLOW — who is being
-- interviewed, what they actually said, what was derived from it, who decided
-- what, and which external writes have and have not landed. It stores chart
-- facts only as references plus the minimum text needed to show a clinician
-- what the agent was reasoning over; it is not a second copy of the chart.
--
-- Every table is tenant-scoped. Nothing is global.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Where a value came from. This is a first-class column, never re-derived at
-- read time from whether credentials happen to be configured.
CREATE TYPE data_origin AS ENUM ('live', 'cache', 'fixture', 'failed', 'unknown');

CREATE TYPE intake_state AS ENUM (
  'created', 'consented', 'in_progress', 'ready_for_review',
  'under_review', 'signed', 'abandoned'
);

CREATE TYPE turn_speaker AS ENUM ('patient', 'agent', 'system');

CREATE TYPE decision_kind AS ENUM ('approve', 'edit', 'reject');

CREATE TYPE outbox_status AS ENUM ('pending', 'in_flight', 'succeeded', 'failed', 'abandoned');

CREATE TYPE write_receipt_status AS ENUM ('written', 'not-attempted', 'failed');

/* ------------------------------------------------------------------ */
/* Tenancy and actors                                                  */
/* ------------------------------------------------------------------ */

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- An actor is a reference to an identity proven elsewhere (Medplum OAuth).
-- No password, no secret, no roster. `subject` is the external identity claim.
CREATE TABLE actors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject      text NOT NULL,
  role         text NOT NULL CHECK (role IN ('clinician', 'patient', 'agent', 'operator')),
  display_name text,
  fhir_ref     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject)
);

/* ------------------------------------------------------------------ */
/* Intake sessions                                                     */
/* ------------------------------------------------------------------ */

CREATE TABLE intake_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- References into Medplum. We do NOT duplicate the chart here.
  patient_ref       text NOT NULL,
  appointment_ref   text,

  state             intake_state NOT NULL DEFAULT 'created',
  locale            text NOT NULL DEFAULT 'en',

  -- Consent is versioned: what the patient agreed to must be reconstructable.
  consent_version   text,
  consented_at      timestamptz,

  -- Safety coverage is a fact about the packet. NULL means not yet evaluated;
  -- false means "not screened", which must never render as "nothing found".
  safety_covered    boolean,
  safety_note       text,

  assigned_to       uuid REFERENCES actors(id),
  assigned_at       timestamptz,

  -- Optimistic concurrency. Every mutating command must present the version it
  -- read; a mismatch is a 409, not a silent overwrite.
  version           integer NOT NULL DEFAULT 1,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  signed_at         timestamptz,
  signed_by         uuid REFERENCES actors(id),

  -- A session may only be signed by an actor, at a time, together.
  CONSTRAINT signed_is_complete CHECK (
    (state <> 'signed') OR (signed_at IS NOT NULL AND signed_by IS NOT NULL)
  )
);

CREATE INDEX idx_sessions_queue ON intake_sessions (tenant_id, state, updated_at DESC);
CREATE INDEX idx_sessions_patient ON intake_sessions (tenant_id, patient_ref);

/* ------------------------------------------------------------------ */
/* Immutable conversation                                              */
/* ------------------------------------------------------------------ */

-- Turns are append-only. There is no UPDATE path in the repository; a
-- correction is a NEW turn that supersedes an earlier one. This is what makes
-- an extracted fact's transcript span meaningful later.
CREATE TABLE session_turns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  seq               integer NOT NULL,
  speaker           turn_speaker NOT NULL,
  text              text NOT NULL,
  lang              text,
  at_seconds        numeric(10,3),

  -- Ties this turn to the voice provider event that produced it, so a
  -- duplicate final transcript can be suppressed idempotently.
  provider          text,
  provider_event_id text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, seq)
);

-- Duplicate-final-transcript suppression, enforced by the database rather than
-- by hopeful client-side de-duplication.
CREATE UNIQUE INDEX idx_turns_provider_event
  ON session_turns (session_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

/* ------------------------------------------------------------------ */
/* Derived content — each row must trace to its source                 */
/* ------------------------------------------------------------------ */

-- Candidate facts produced by the LLM. Never clinical truth on their own.
CREATE TABLE extracted_facts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  turn_id         uuid NOT NULL REFERENCES session_turns(id) ON DELETE CASCADE,

  field           text NOT NULL,
  value           jsonb NOT NULL,

  -- The exact span of the source turn this came from. Without it the fact is
  -- ungrounded and must be rejected.
  span_start      integer NOT NULL,
  span_end        integer NOT NULL,

  confidence      numeric(4,3),
  uncertain       boolean NOT NULL DEFAULT false,
  supersedes      uuid REFERENCES extracted_facts(id),

  model_provider  text NOT NULL,
  model_version   text NOT NULL,
  prompt_version  text NOT NULL,
  trace_id        text,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT span_is_sane CHECK (span_end >= span_start AND span_start >= 0)
);

-- Chart facts actually used in a turn, pinned to the resource VERSION that was
-- read, so a later chart change cannot silently rewrite the reasoning history.
CREATE TABLE retrieved_facts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  turn_id         uuid REFERENCES session_turns(id) ON DELETE CASCADE,

  fhir_type       text NOT NULL,
  fhir_id         text NOT NULL,
  fhir_version    text,
  display_text    text NOT NULL,

  origin          data_origin NOT NULL,
  retriever       text NOT NULL,
  score           numeric(6,4),
  index_version   text,
  latency_ms      integer,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Deterministic rule outcomes, INCLUDING negatives and coverage gaps. Storing
-- only positives would make "no rule fired" indistinguishable from
-- "rules never ran".
CREATE TABLE rule_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  turn_id         uuid REFERENCES session_turns(id) ON DELETE CASCADE,

  rule_id         text,
  fired           boolean NOT NULL,
  severity        text,
  locale          text NOT NULL,
  covered         boolean NOT NULL,
  detail          text,
  duration_ms     numeric(10,3),

  created_at      timestamptz NOT NULL DEFAULT now()
);

/* ------------------------------------------------------------------ */
/* Clinician decisions                                                 */
/* ------------------------------------------------------------------ */

-- Every promotable item needs an explicit decision. Silence is not consent, so
-- there is no default row and no implicit approval.
CREATE TABLE clinician_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,

  item_key        text NOT NULL,
  kind            decision_kind NOT NULL,
  original_text   text,
  edited_text     text,

  actor_id        uuid NOT NULL REFERENCES actors(id),
  -- The session version the clinician was actually looking at. A decision made
  -- against a stale view must be detectable.
  review_version  integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- One decision per item per session. Changing a decision is an explicit
  -- update through the repository, not a second competing row.
  UNIQUE (session_id, item_key),

  CONSTRAINT edit_has_text CHECK (kind <> 'edit' OR edited_text IS NOT NULL)
);

/* ------------------------------------------------------------------ */
/* External integrations, idempotency, and recovery                    */
/* ------------------------------------------------------------------ */

CREATE TABLE integration_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES intake_sessions(id) ON DELETE CASCADE,

  provider        text NOT NULL,
  operation       text NOT NULL,
  origin          data_origin NOT NULL,
  ok              boolean NOT NULL,
  status_code     integer,
  latency_ms      integer,
  trace_id        text,
  correlation_id  text,
  -- Sanitised only. Never a raw provider payload, never PHI.
  error_class     text,
  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_calls_corr ON integration_calls (tenant_id, correlation_id);

-- Outbox: an external write is DECIDED in the same transaction as the state
-- change that justifies it, then performed separately. This is what makes a
-- crash between "clinician signed" and "FHIR write landed" recoverable instead
-- of producing either a lost signature or duplicate resources.
CREATE TABLE write_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id       uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,

  -- Stable across process restarts. This is the duplicate-write guard.
  idempotency_key  text NOT NULL,
  resource_type    text NOT NULL,
  payload          jsonb NOT NULL,

  status           outbox_status NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idx_outbox_claimable ON write_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- What actually landed, per resource. Never a placeholder id.
CREATE TABLE write_receipts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id       uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  outbox_id        uuid REFERENCES write_outbox(id) ON DELETE SET NULL,

  resource_type    text NOT NULL,
  resource_id      text,
  resource_version text,
  status           write_receipt_status NOT NULL,
  detail           text,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- A receipt claiming a write succeeded must carry the real server-assigned id.
  CONSTRAINT written_has_id CHECK (status <> 'written' OR resource_id IS NOT NULL)
);

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

CREATE TABLE audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid REFERENCES intake_sessions(id) ON DELETE CASCADE,

  action          text NOT NULL,
  actor_id        uuid REFERENCES actors(id),
  actor_subject   text,
  outcome         text NOT NULL,
  detail          jsonb,
  correlation_id  text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_session ON audit_events (tenant_id, session_id, created_at DESC);
