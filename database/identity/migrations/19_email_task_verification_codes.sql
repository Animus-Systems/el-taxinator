-- Identity DB: add hashed task codes for email-driven verification flows.
--
-- Keeps existing token_hash flow for backward compatibility while enabling
-- human-entered codes in portal UI.

BEGIN;

ALTER TABLE iam.email_verification_token
  ADD COLUMN IF NOT EXISTS code_hash text;

ALTER TABLE iam.password_reset_token
  ADD COLUMN IF NOT EXISTS code_hash text;

ALTER TABLE iam.email_change_token
  ADD COLUMN IF NOT EXISTS code_hash text;

CREATE INDEX IF NOT EXISTS email_verification_token_code_hash_idx
  ON iam.email_verification_token(code_hash, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS password_reset_token_code_hash_idx
  ON iam.password_reset_token(code_hash, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS email_change_token_code_hash_idx
  ON iam.email_change_token(code_hash, created_at DESC)
  WHERE used_at IS NULL;

COMMIT;
