-- Identity DB: seed identity providers
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§14.2.9)

BEGIN;

INSERT INTO iam.identity_provider (
  code,
  issuer,
  display_name,
  trust_email_verified,
  allow_linking
)
VALUES
  ('google', 'https://accounts.google.com', 'Google', true, true),
  ('apple',  'https://appleid.apple.com',  'Apple',  true, true)
ON CONFLICT (code) DO UPDATE
SET
  issuer = EXCLUDED.issuer,
  display_name = EXCLUDED.display_name,
  trust_email_verified = EXCLUDED.trust_email_verified,
  allow_linking = EXCLUDED.allow_linking,
  updated_at = now();

COMMIT;
