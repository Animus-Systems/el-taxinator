-- Identity DB: frozen constants enforcement
-- Source-of-truth: database/identity/docs/constants.md
--
-- Enforces:
-- - MAX_JWT_TTL_SECONDS via a DB setting + trigger on oidc.client TTL fields.
--
-- Note: This can only enforce values stored in the DB (e.g. client TTL config).
-- Token issuance logic must still use the same constant when creating JWTs.

BEGIN;

-- Freeze the constant in the DB so constraints/triggers can reference it.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET identity.max_jwt_ttl_seconds TO %L', current_database(), '3600');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping ALTER DATABASE SET for identity.max_jwt_ttl_seconds due to insufficient privileges';
END $$;

CREATE OR REPLACE FUNCTION ops.max_jwt_ttl_seconds()
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(nullif(current_setting('identity.max_jwt_ttl_seconds', true), '')::int, 3600);
$$;

ALTER FUNCTION ops.max_jwt_ttl_seconds() OWNER TO identity_owner;
REVOKE ALL ON FUNCTION ops.max_jwt_ttl_seconds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.max_jwt_ttl_seconds() TO identity_app, identity_migrator, identity_breakglass;

CREATE OR REPLACE FUNCTION oidc.enforce_client_ttl_max()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  max_ttl int;
BEGIN
  max_ttl := ops.max_jwt_ttl_seconds();
  IF max_ttl IS NULL OR max_ttl <= 0 THEN
    RAISE EXCEPTION 'identity.max_jwt_ttl_seconds is not set or invalid';
  END IF;

  IF NEW.access_token_ttl_seconds > max_ttl THEN
    RAISE EXCEPTION 'access_token_ttl_seconds % exceeds MAX_JWT_TTL_SECONDS %', NEW.access_token_ttl_seconds, max_ttl;
  END IF;
  IF NEW.id_token_ttl_seconds > max_ttl THEN
    RAISE EXCEPTION 'id_token_ttl_seconds % exceeds MAX_JWT_TTL_SECONDS %', NEW.id_token_ttl_seconds, max_ttl;
  END IF;

  RETURN NEW;
END $$;

ALTER FUNCTION oidc.enforce_client_ttl_max() OWNER TO identity_owner;
REVOKE ALL ON FUNCTION oidc.enforce_client_ttl_max() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION oidc.enforce_client_ttl_max() TO identity_migrator;

DROP TRIGGER IF EXISTS enforce_client_ttl_max ON oidc.client;
CREATE TRIGGER enforce_client_ttl_max
BEFORE INSERT OR UPDATE ON oidc.client
FOR EACH ROW
EXECUTE FUNCTION oidc.enforce_client_ttl_max();

COMMIT;
