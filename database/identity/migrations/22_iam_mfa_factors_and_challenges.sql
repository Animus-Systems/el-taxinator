-- Identity DB: MFA factors + login/setup challenge sessions (TOTP + Passkey/WebAuthn)

BEGIN;

ALTER TABLE iam.security_event
  DROP CONSTRAINT IF EXISTS security_event_event_type_check;

ALTER TABLE iam.security_event
  ADD CONSTRAINT security_event_event_type_check
  CHECK (
    event_type IN (
      'AUTH_LOCKOUT',
      'AUTH_FAILURE_SPIKE',
      'REFRESH_TOKEN_REUSE',
      'SESSION_REVOKED',
      'GRANT_REVOKED',
      'PASSWORD_CHANGED',
      'EMAIL_CHANGED',
      'EMAIL_VERIFIED',
      'IDENTITY_LINKED',
      'IDENTITY_UNLINKED',
      'MISSING_IDENTIFIERS',
      'RLS_POLICY_MISCONFIG',
      'MFA_TOTP_ENROLLED',
      'MFA_TOTP_REMOVED',
      'MFA_PASSKEY_ENROLLED',
      'MFA_PASSKEY_REMOVED',
      'SYSTEM_ERROR'
    )
  );

CREATE TABLE IF NOT EXISTS iam.mfa_totp_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  secret_base32 text NOT NULL,
  issuer text NOT NULL DEFAULT 'Taxinator',
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  disabled_at timestamptz
);

ALTER TABLE iam.mfa_totp_factor OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON iam.mfa_totp_factor;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON iam.mfa_totp_factor
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS mfa_totp_factor_user_active_uniq
  ON iam.mfa_totp_factor(user_id)
  WHERE is_active = true AND disabled_at IS NULL;

CREATE INDEX IF NOT EXISTS mfa_totp_factor_user_idx
  ON iam.mfa_totp_factor(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS iam.webauthn_credential (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  device_type text,
  backed_up boolean,
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT webauthn_credential_transports_array CHECK (jsonb_typeof(transports) = 'array')
);

ALTER TABLE iam.webauthn_credential OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON iam.webauthn_credential;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON iam.webauthn_credential
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

CREATE INDEX IF NOT EXISTS webauthn_credential_user_idx
  ON iam.webauthn_credential(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webauthn_credential_active_user_idx
  ON iam.webauthn_credential(user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS iam.mfa_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  challenge_type text NOT NULL CHECK (
    challenge_type IN (
      'login',
      'login_passkey',
      'totp_setup',
      'passkey_setup'
    )
  ),
  token_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 10,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE iam.mfa_challenge OWNER TO identity_owner;

CREATE INDEX IF NOT EXISTS mfa_challenge_user_created_idx
  ON iam.mfa_challenge(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mfa_challenge_expires_idx
  ON iam.mfa_challenge(expires_at);

DO $$
DECLARE
  force_rls boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='identity_breakglass' AND rolbypassrls
  ) INTO force_rls;

  ALTER TABLE iam.mfa_totp_factor ENABLE ROW LEVEL SECURITY;
  ALTER TABLE iam.webauthn_credential ENABLE ROW LEVEL SECURITY;
  ALTER TABLE iam.mfa_challenge ENABLE ROW LEVEL SECURITY;
  IF force_rls THEN
    ALTER TABLE iam.mfa_totp_factor FORCE ROW LEVEL SECURITY;
    ALTER TABLE iam.webauthn_credential FORCE ROW LEVEL SECURITY;
    ALTER TABLE iam.mfa_challenge FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS identity_app_all ON iam.mfa_totp_factor;
CREATE POLICY identity_app_all ON iam.mfa_totp_factor
  FOR ALL TO identity_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_migrator_all ON iam.mfa_totp_factor;
CREATE POLICY identity_migrator_all ON iam.mfa_totp_factor
  FOR ALL TO identity_migrator
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_owner_all ON iam.mfa_totp_factor;
CREATE POLICY identity_owner_all ON iam.mfa_totp_factor
  FOR ALL TO identity_owner
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_app_all ON iam.webauthn_credential;
CREATE POLICY identity_app_all ON iam.webauthn_credential
  FOR ALL TO identity_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_migrator_all ON iam.webauthn_credential;
CREATE POLICY identity_migrator_all ON iam.webauthn_credential
  FOR ALL TO identity_migrator
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_owner_all ON iam.webauthn_credential;
CREATE POLICY identity_owner_all ON iam.webauthn_credential
  FOR ALL TO identity_owner
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_app_all ON iam.mfa_challenge;
CREATE POLICY identity_app_all ON iam.mfa_challenge
  FOR ALL TO identity_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_migrator_all ON iam.mfa_challenge;
CREATE POLICY identity_migrator_all ON iam.mfa_challenge
  FOR ALL TO identity_migrator
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_owner_all ON iam.mfa_challenge;
CREATE POLICY identity_owner_all ON iam.mfa_challenge
  FOR ALL TO identity_owner
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON iam.mfa_totp_factor TO identity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.webauthn_credential TO identity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.mfa_challenge TO identity_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON iam.mfa_totp_factor TO identity_migrator, identity_breakglass;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.webauthn_credential TO identity_migrator, identity_breakglass;
GRANT SELECT, INSERT, UPDATE, DELETE ON iam.mfa_challenge TO identity_migrator, identity_breakglass;

COMMIT;
