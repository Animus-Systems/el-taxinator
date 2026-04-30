-- Identity DB: RLS sanity checks
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§14.2.7)

-- NOTE:
-- The RLS predicate model is UNSPECIFIED IN SOURCE DOC; current policy posture is:
-- - identity_app: service-role allow-all (policies are USING true)
-- - identity_breakglass: BYPASSRLS

DO $$
DECLARE
  r record;
BEGIN
  -- Breakglass must have BYPASSRLS and RLS must be active for the service role.
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'identity_breakglass') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Expected identity_breakglass.rolbypassrls = true';
  END IF;

  -- RLS must be enabled + forced on all base tables in the protected schemas.
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('iam', 'oidc', 'ops')
      AND c.relkind = 'r'
  LOOP
    IF r.relrowsecurity IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Expected RLS enabled on %.%', r.schema_name, r.table_name;
    END IF;
    IF r.relforcerowsecurity IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Expected FORCE RLS on %.%', r.schema_name, r.table_name;
    END IF;
  END LOOP;

  -- identity_readonly must not have base-table privileges.
  IF has_table_privilege('identity_readonly', 'iam.user_account', 'SELECT') THEN
    RAISE EXCEPTION 'identity_readonly unexpectedly has SELECT on iam.user_account';
  END IF;
END $$;
