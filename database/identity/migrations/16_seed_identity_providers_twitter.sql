-- Identity DB: seed Twitter/X identity provider
-- Adds support for OAuth login via X/Twitter (no email is provided by default).

BEGIN;

INSERT INTO iam.identity_provider (
  code,
  issuer,
  display_name,
  trust_email_verified,
  allow_linking
)
VALUES
  ('twitter', 'https://twitter.com', 'X (Twitter)', false, true)
ON CONFLICT (code) DO UPDATE
SET
  issuer = EXCLUDED.issuer,
  display_name = EXCLUDED.display_name,
  trust_email_verified = EXCLUDED.trust_email_verified,
  allow_linking = EXCLUDED.allow_linking,
  updated_at = now();

COMMIT;

