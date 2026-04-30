-- Identity DB: default privilege hardening for migration runner roles
--
-- In dev/tests we run migrations as `postgres` (superuser). In production we'd typically run
-- migrations as `identity_migrator`. Ensure neither role accidentally creates functions that
-- become executable by PUBLIC.

BEGIN;

DO $$
BEGIN
  -- postgres (dev/test runner)
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA iam REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA oidc REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ops REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

  -- identity_migrator (prod runner)
  ALTER DEFAULT PRIVILEGES FOR ROLE identity_migrator IN SCHEMA iam REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE identity_migrator IN SCHEMA oidc REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE identity_migrator IN SCHEMA ops REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE identity_migrator IN SCHEMA admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping default privilege hardening due to insufficient privileges on this provider';
END $$;

COMMIT;
