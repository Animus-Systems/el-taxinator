-- Identity DB: iam schema (accounts, credentials, events)
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§14.2.4)

BEGIN;

-- Trigger helper for updated_at columns (spec assumption: updated_at trigger-maintained).
CREATE OR REPLACE FUNCTION ops.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION ops.set_updated_at() OWNER TO identity_owner;
REVOKE ALL ON FUNCTION ops.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.set_updated_at() TO identity_app, identity_migrator, identity_breakglass;

-- iam.user_account
CREATE TABLE IF NOT EXISTS iam.user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext,
  email_verified boolean NOT NULL DEFAULT false,
  display_name text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (email)
);

ALTER TABLE iam.user_account OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON iam.user_account;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON iam.user_account
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

-- iam.identity_provider
CREATE TABLE IF NOT EXISTS iam.identity_provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  issuer text NOT NULL UNIQUE,
  display_name text NOT NULL,
  trust_email_verified boolean NOT NULL DEFAULT false,
  allow_linking boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE iam.identity_provider OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON iam.identity_provider;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON iam.identity_provider
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

-- iam.auth_identity
CREATE TABLE IF NOT EXISTS iam.auth_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id),
  provider_id uuid NOT NULL REFERENCES iam.identity_provider(id),
  subject text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider_id, subject),
  CONSTRAINT auth_identity_profile_keys CHECK (
    jsonb_typeof(profile) = 'object'
    AND (profile - 'email' - 'name' - 'picture') = '{}'::jsonb
  )
);

ALTER TABLE iam.auth_identity OWNER TO identity_owner;

-- iam.password_credential
CREATE TABLE IF NOT EXISTS iam.password_credential (
  user_id uuid PRIMARY KEY REFERENCES iam.user_account(id),
  password_hash text NOT NULL,
  algo text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE iam.password_credential OWNER TO identity_owner;

-- iam.email_verification_token
CREATE TABLE IF NOT EXISTS iam.email_verification_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE iam.email_verification_token OWNER TO identity_owner;

-- iam.password_reset_token
CREATE TABLE IF NOT EXISTS iam.password_reset_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE iam.password_reset_token OWNER TO identity_owner;

-- iam.auth_attempt
CREATE TABLE IF NOT EXISTS iam.auth_attempt (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  email citext,
  user_id uuid REFERENCES iam.user_account(id) ON DELETE SET NULL,
  ip inet,
  user_agent text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  reason text CHECK (
    reason IS NULL OR reason IN (
      'USER_NOT_FOUND',
      'PASSWORD_INVALID',
      'USER_DISABLED',
      'EMAIL_NOT_VERIFIED',
      'MFA_REQUIRED',
      'MFA_INVALID',
      'OIDC_ERROR',
      'LOCKED_OUT',
      'RATE_LIMITED',
      'UNKNOWN'
    )
  ),
  meta jsonb
);

ALTER TABLE iam.auth_attempt OWNER TO identity_owner;
ALTER SEQUENCE IF EXISTS iam.auth_attempt_id_seq OWNER TO identity_owner;

-- iam.security_event
CREATE TABLE IF NOT EXISTS iam.security_event (
  id bigserial PRIMARY KEY,
  event_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (
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
      'SYSTEM_ERROR'
    )
  ),
  user_id uuid REFERENCES iam.user_account(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES iam.user_account(id) ON DELETE SET NULL,
  ip inet,
  user_agent text,
  meta jsonb
);

ALTER TABLE iam.security_event OWNER TO identity_owner;
ALTER SEQUENCE IF EXISTS iam.security_event_id_seq OWNER TO identity_owner;

-- Required indexes (§9)
CREATE INDEX IF NOT EXISTS security_event_user_event_at_idx
  ON iam.security_event (user_id, event_at DESC);

CREATE INDEX IF NOT EXISTS security_event_event_at_idx
  ON iam.security_event (event_at);

CREATE INDEX IF NOT EXISTS security_event_event_at_id_idx
  ON iam.security_event (event_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS auth_attempt_reason_at_idx
  ON iam.auth_attempt (reason, at DESC);

CREATE INDEX IF NOT EXISTS auth_attempt_at_id_idx
  ON iam.auth_attempt (at DESC, id DESC);

-- ops.outbox_event + ops.email_delivery (tables are in-scope per spec; file list omits an ops migration).
CREATE TABLE IF NOT EXISTS ops.outbox_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  key text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text
);

ALTER TABLE ops.outbox_event OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON ops.outbox_event;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON ops.outbox_event
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS outbox_event_topic_key_uniq
  ON ops.outbox_event(topic, key)
  WHERE key IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbox_failed_permanent_idx
  ON ops.outbox_event (updated_at DESC)
  WHERE status = 'failed' AND attempt_count >= 5;

CREATE TABLE IF NOT EXISTS ops.email_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES iam.user_account(id) ON DELETE SET NULL,
  to_email citext NOT NULL,
  template_code text NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE ops.email_delivery OWNER TO identity_owner;

-- Outbox claim function (§7.18)
CREATE OR REPLACE FUNCTION ops.claim_outbox_events(p_worker_id text, p_batch_size int)
RETURNS SETOF ops.outbox_event
LANGUAGE sql
AS $$
  WITH eligible AS (
    SELECT id
    FROM ops.outbox_event
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
      AND attempt_count < 5
    ORDER BY next_attempt_at, created_at, id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ops.outbox_event oe
  SET status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  FROM eligible
  WHERE oe.id = eligible.id
  RETURNING oe.*;
$$;

ALTER FUNCTION ops.claim_outbox_events(text, int) OWNER TO identity_owner;
REVOKE ALL ON FUNCTION ops.claim_outbox_events(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.claim_outbox_events(text, int) TO identity_app;

COMMIT;
