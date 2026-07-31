-- The conversation engine mints its own session id ("sess-<ms>") before any
-- database row exists, and the patient's browser keeps using that id for the
-- whole intake. Rather than force the engine to wait for a server round trip
-- just to learn a UUID, the durable row carries the engine's id alongside its
-- own primary key.
--
-- Unique PER TENANT, not globally: two clinics must be able to mint the same
-- opaque id without colliding, and a globally unique constraint would leak the
-- existence of another tenant's session through a constraint violation.

ALTER TABLE intake_sessions ADD COLUMN external_id text;

CREATE UNIQUE INDEX idx_sessions_external
  ON intake_sessions (tenant_id, external_id)
  WHERE external_id IS NOT NULL;

-- The clinical projection the clinician UI renders. Medplum remains the source
-- of truth for FHIR resources; this is the reviewable draft, stored so a
-- restart cannot lose an in-flight intake.
ALTER TABLE intake_sessions ADD COLUMN story_map jsonb;
