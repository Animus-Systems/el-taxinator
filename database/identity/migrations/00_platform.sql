-- Identity DB bootstrap: platform prerequisites
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§4.1, §14.2.1)

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Set DB timezone default to UTC (dynamic so the script is DB-name agnostic).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END $$;

COMMIT;

