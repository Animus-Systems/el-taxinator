-- Identity DB: frozen constants (DB-enforced)
-- Source-of-truth: database/identity/docs/constants.md
--
-- This creates an `ops.frozen_constants` table to make constants visible and queryable,
-- and wires enforcement to read the constant from that table.

BEGIN;

CREATE TABLE IF NOT EXISTS ops.frozen_constants (
  key text PRIMARY KEY,
  value_int int,
  value_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT frozen_constants_value_present
    CHECK (value_int IS NOT NULL OR value_text IS NOT NULL)
);

ALTER TABLE ops.frozen_constants OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON ops.frozen_constants;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON ops.frozen_constants
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

-- RLS posture: FORCE RLS across ops schema tables.
ALTER TABLE ops.frozen_constants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.frozen_constants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_app_all ON ops.frozen_constants;
CREATE POLICY identity_app_all ON ops.frozen_constants
  FOR SELECT TO identity_app
  USING (true);

DROP POLICY IF EXISTS identity_migrator_all ON ops.frozen_constants;
CREATE POLICY identity_migrator_all ON ops.frozen_constants
  FOR ALL TO identity_migrator
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_owner_all ON ops.frozen_constants;
CREATE POLICY identity_owner_all ON ops.frozen_constants
  FOR SELECT TO identity_owner
  USING (true);

-- Grants: app can read; only migrator can modify.
REVOKE ALL ON ops.frozen_constants FROM PUBLIC;
GRANT SELECT ON ops.frozen_constants TO identity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.frozen_constants TO identity_migrator;

-- Seed constant values (must match docs/constants.md).
INSERT INTO ops.frozen_constants(key, value_int)
VALUES ('MAX_JWT_TTL_SECONDS', 3600)
ON CONFLICT (key) DO UPDATE
  SET value_int = EXCLUDED.value_int,
      updated_at = now();

-- Keep the DB-level setting aligned (used by `SHOW identity.max_jwt_ttl_seconds`).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET identity.max_jwt_ttl_seconds TO %L', current_database(), '3600');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping ALTER DATABASE SET for identity.max_jwt_ttl_seconds due to insufficient privileges';
END $$;

-- Make the enforcement function read from ops.frozen_constants (queryable source-of-truth).
CREATE OR REPLACE FUNCTION ops.max_jwt_ttl_seconds()
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT fc.value_int
  FROM ops.frozen_constants fc
  WHERE fc.key = 'MAX_JWT_TTL_SECONDS';
$$;

ALTER FUNCTION ops.max_jwt_ttl_seconds() OWNER TO identity_owner;
REVOKE ALL ON FUNCTION ops.max_jwt_ttl_seconds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.max_jwt_ttl_seconds() TO identity_app, identity_migrator, identity_breakglass;

COMMIT;
