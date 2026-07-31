-- Rollback for 001_init.
--
-- Destructive by definition: this drops workflow, transcript, decision, and
-- audit history. It exists so a failed deploy can be reversed in staging. It is
-- NOT a routine production operation — a signed session's audit trail is a
-- record of a clinical decision, and clinics have retention obligations that
-- outlive any schema change. Take a verified backup first.

DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS write_receipts;
DROP TABLE IF EXISTS write_outbox;
DROP TABLE IF EXISTS integration_calls;
DROP TABLE IF EXISTS clinician_decisions;
DROP TABLE IF EXISTS rule_evaluations;
DROP TABLE IF EXISTS retrieved_facts;
DROP TABLE IF EXISTS extracted_facts;
DROP TABLE IF EXISTS session_turns;
DROP TABLE IF EXISTS intake_sessions;
DROP TABLE IF EXISTS actors;
DROP TABLE IF EXISTS tenants;

DROP TYPE IF EXISTS write_receipt_status;
DROP TYPE IF EXISTS outbox_status;
DROP TYPE IF EXISTS decision_kind;
DROP TYPE IF EXISTS turn_speaker;
DROP TYPE IF EXISTS intake_state;
DROP TYPE IF EXISTS data_origin;
