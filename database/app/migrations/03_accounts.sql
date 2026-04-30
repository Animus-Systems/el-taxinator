-- App DB: bank / cash / crypto accounts.
--
-- Holds the financial endpoints money flows through. A transaction will
-- reference `account_id` (origin) and optionally `counter_account_id` for
-- transfers between own accounts. Currency lives on the account, not the
-- transaction line, because most transactions inherit the account's currency.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.account (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  name            text NOT NULL,
  bank_name       text,
  currency_code   text NOT NULL DEFAULT 'EUR' REFERENCES tax.currency(code),
  account_number  text,
  account_type    text NOT NULL DEFAULT 'bank',
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (tenant_id, id),
  CONSTRAINT account_type_valid CHECK (
    account_type IN ('bank','credit_card','crypto_exchange','crypto_wallet','cash')
  )
);
ALTER TABLE tax.account OWNER TO db_owner;
ALTER TABLE tax.account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.account;
CREATE POLICY tenant_isolation ON tax.account
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS account_tenant_active_type_idx
  ON tax.account (tenant_id, account_type) WHERE is_active;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_account') THEN
    CREATE TRIGGER set_updated_at_account BEFORE UPDATE ON tax.account
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.account TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.account TO platform_admin;

COMMIT;
