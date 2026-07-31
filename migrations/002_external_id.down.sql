DROP INDEX IF EXISTS idx_sessions_external;
ALTER TABLE intake_sessions DROP COLUMN IF EXISTS story_map;
ALTER TABLE intake_sessions DROP COLUMN IF EXISTS external_id;
