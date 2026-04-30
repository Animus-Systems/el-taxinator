-- Identity DB: oidc schema (clients, redirects, consents, signing keys, runtime store)
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§14.2.5)

BEGIN;

-- oidc.client
CREATE TABLE IF NOT EXISTS oidc.client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret_hash text,
  name text NOT NULL,
  client_type text NOT NULL CHECK (client_type IN ('public', 'confidential')),
  grant_types text[] NOT NULL DEFAULT '{}'::text[],
  response_types text[] NOT NULL DEFAULT '{}'::text[],
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  require_pkce boolean NOT NULL DEFAULT true,
  require_consent boolean NOT NULL DEFAULT true,
  access_token_ttl_seconds int NOT NULL,
  refresh_token_ttl_seconds int NOT NULL,
  id_token_ttl_seconds int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE oidc.client OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON oidc.client;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON oidc.client
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

-- oidc.client_redirect_uri
CREATE TABLE IF NOT EXISTS oidc.client_redirect_uri (
  client_id text NOT NULL REFERENCES oidc.client(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  PRIMARY KEY (client_id, redirect_uri)
);

ALTER TABLE oidc.client_redirect_uri OWNER TO identity_owner;

-- oidc.client_post_logout_redirect_uri
CREATE TABLE IF NOT EXISTS oidc.client_post_logout_redirect_uri (
  client_id text NOT NULL REFERENCES oidc.client(client_id) ON DELETE CASCADE,
  post_logout_redirect_uri text NOT NULL,
  PRIMARY KEY (client_id, post_logout_redirect_uri)
);

ALTER TABLE oidc.client_post_logout_redirect_uri OWNER TO identity_owner;

-- oidc.user_consent
CREATE TABLE IF NOT EXISTS oidc.user_consent (
  user_id uuid NOT NULL REFERENCES iam.user_account(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES oidc.client(client_id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

ALTER TABLE oidc.user_consent OWNER TO identity_owner;

DROP TRIGGER IF EXISTS set_updated_at ON oidc.user_consent;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON oidc.user_consent
FOR EACH ROW
EXECUTE FUNCTION ops.set_updated_at();

-- oidc.signing_key
CREATE TABLE IF NOT EXISTS oidc.signing_key (
  kid text PRIMARY KEY,
  alg text NOT NULL CHECK (alg IN ('RS256', 'ES256')),
  public_jwk jsonb NOT NULL,
  private_jwk_enc bytea NOT NULL,
  enc_kms_key_id text NOT NULL CHECK (length(enc_kms_key_id) > 0),
  enc_key_version text NOT NULL CHECK (length(enc_key_version) > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

ALTER TABLE oidc.signing_key OWNER TO identity_owner;

-- oidc.store
CREATE TABLE IF NOT EXISTS oidc.store (
  model text NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  user_id uuid REFERENCES iam.user_account(id) ON DELETE SET NULL,
  client_id text REFERENCES oidc.client(client_id) ON DELETE SET NULL,
  grant_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model, id)
);

ALTER TABLE oidc.store OWNER TO identity_owner;

-- Freeze allowed `model` values (blocking constant; required before production).
-- Source-of-truth: database/identity/docs/constants.md (OIDC_STORE_MODEL_ALLOWED)
ALTER TABLE oidc.store
  DROP CONSTRAINT IF EXISTS oidc_store_model_allowed;
ALTER TABLE oidc.store
  ADD CONSTRAINT oidc_store_model_allowed
  CHECK (model IN (
    'Session',
    'Interaction',
    'AuthorizationCode',
    'AccessToken',
    'RefreshToken',
    'Grant',
    'ReplayDetection'
  ));

-- Index for purge support (§9).
CREATE INDEX IF NOT EXISTS oidc_store_expires_at_idx
  ON oidc.store (expires_at);

COMMIT;
