-- Identity DB: RLS enablement + policies + grants
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§14.2.6)

BEGIN;

-- RLS is enabled + forced for every table in iam/oidc/ops. Policies are currently "service role allow all"
-- because the per-user predicate model is UNSPECIFIED IN SOURCE DOC.

DO $$
DECLARE
  tbl regclass;
  force_rls boolean := false;
BEGIN
  -- FORCE RLS requires a true BYPASSRLS "breakglass" path; some managed providers disallow BYPASSRLS.
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='identity_breakglass' AND rolbypassrls
  ) INTO force_rls;

  FOREACH tbl IN ARRAY ARRAY[
    -- iam
    'iam.user_account'::regclass,
    'iam.identity_provider'::regclass,
    'iam.auth_identity'::regclass,
    'iam.password_credential'::regclass,
    'iam.email_verification_token'::regclass,
    'iam.password_reset_token'::regclass,
    'iam.auth_attempt'::regclass,
    'iam.security_event'::regclass,
    -- oidc
    'oidc.client'::regclass,
    'oidc.client_redirect_uri'::regclass,
    'oidc.client_post_logout_redirect_uri'::regclass,
    'oidc.user_consent'::regclass,
    'oidc.signing_key'::regclass,
    'oidc.store'::regclass,
    -- ops
    'ops.outbox_event'::regclass,
    'ops.email_delivery'::regclass
  ]
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    IF force_rls THEN
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

-- Policies: allow-all for the service + migrator roles.
DO $$
DECLARE
  tbl regclass;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'iam.user_account'::regclass,
    'iam.identity_provider'::regclass,
    'iam.auth_identity'::regclass,
    'iam.password_credential'::regclass,
    'iam.email_verification_token'::regclass,
    'iam.password_reset_token'::regclass,
    'iam.auth_attempt'::regclass,
    'iam.security_event'::regclass,
    'oidc.client'::regclass,
    'oidc.client_redirect_uri'::regclass,
    'oidc.client_post_logout_redirect_uri'::regclass,
    'oidc.user_consent'::regclass,
    'oidc.signing_key'::regclass,
    'oidc.store'::regclass,
    'ops.outbox_event'::regclass,
    'ops.email_delivery'::regclass
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS identity_app_all ON %s', tbl);
    EXECUTE format(
      'CREATE POLICY identity_app_all ON %s FOR ALL TO identity_app USING (true) WITH CHECK (true)',
      tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS identity_migrator_all ON %s', tbl);
    EXECUTE format(
      'CREATE POLICY identity_migrator_all ON %s FOR ALL TO identity_migrator USING (true) WITH CHECK (true)',
      tbl
    );

    -- Views are owned by identity_owner; with FORCE RLS enabled this role must have an allow-all policy
    -- so admin views can function without granting base-table privileges to readers.
    EXECUTE format('DROP POLICY IF EXISTS identity_owner_all ON %s', tbl);
    EXECUTE format(
      'CREATE POLICY identity_owner_all ON %s FOR ALL TO identity_owner USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- Explicit grants: identity_app can operate as the service role.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  iam.user_account,
  iam.identity_provider,
  iam.auth_identity,
  iam.password_credential,
  iam.email_verification_token,
  iam.password_reset_token,
  iam.auth_attempt,
  iam.security_event
TO identity_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  oidc.client,
  oidc.client_redirect_uri,
  oidc.client_post_logout_redirect_uri,
  oidc.user_consent,
  oidc.signing_key,
  oidc.store
TO identity_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  ops.outbox_event,
  ops.email_delivery
TO identity_app;

-- Sequences for bigserial PKs (required for INSERT without explicit ids).
GRANT USAGE, SELECT, UPDATE ON SEQUENCE iam.auth_attempt_id_seq TO identity_app, identity_migrator, identity_breakglass;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE iam.security_event_id_seq TO identity_app, identity_migrator, identity_breakglass;

-- Migrator and breakglass are tightly-held operator roles.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, oidc, ops, admin TO identity_migrator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, oidc, ops TO identity_breakglass;

COMMIT;
