-- Identity DB: optional phone for platform users (E.164).

BEGIN;

ALTER TABLE iam.user_account
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE iam.user_account
  DROP CONSTRAINT IF EXISTS user_account_phone_format_check;

ALTER TABLE iam.user_account
  ADD CONSTRAINT user_account_phone_format_check
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

CREATE INDEX IF NOT EXISTS idx_iam_user_account_phone_lower
  ON iam.user_account (lower(phone))
  WHERE phone IS NOT NULL;

COMMIT;
