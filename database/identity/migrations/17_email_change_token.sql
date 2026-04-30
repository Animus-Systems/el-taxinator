-- Identity DB: email change verification tokens
-- Adds token storage for "change email then verify" flow.

BEGIN;

CREATE TABLE IF NOT EXISTS iam.email_change_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  new_email citext NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE iam.email_change_token OWNER TO identity_owner;

CREATE INDEX IF NOT EXISTS email_change_token_user_id_created_at_idx
  ON iam.email_change_token(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_change_token_expires_at_idx
  ON iam.email_change_token(expires_at);

ALTER TABLE iam.email_change_token ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  force_rls boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='identity_breakglass' AND rolbypassrls
  ) INTO force_rls;
  IF force_rls THEN
    ALTER TABLE iam.email_change_token FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS identity_app_all ON iam.email_change_token;
CREATE POLICY identity_app_all
  ON iam.email_change_token
  FOR ALL
  TO identity_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_migrator_all ON iam.email_change_token;
CREATE POLICY identity_migrator_all
  ON iam.email_change_token
  FOR ALL
  TO identity_migrator
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_owner_all ON iam.email_change_token;
CREATE POLICY identity_owner_all
  ON iam.email_change_token
  FOR ALL
  TO identity_owner
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON iam.email_change_token TO identity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.email_change_token TO identity_migrator, identity_breakglass;

COMMIT;
