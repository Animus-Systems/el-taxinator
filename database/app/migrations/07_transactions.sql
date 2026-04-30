-- App DB: transactions (bank ledger / expense rows / income / transfers).
--
-- The single most-written table in the system. Every line on a bank
-- statement, every receipt, every income event lives here. Lots of optional
-- columns because the same row models four very different shapes:
--   * type='expense'  → outflow with merchant + category + receipt files
--   * type='income'   → inflow tied to an income source (added later phase)
--   * type='transfer' → paired rows linked via transfer_id between own accounts
--   * extra->>'crypto' set → crypto buy/sell with FIFO cost-basis (later phase)
--
-- Cents are stored as BIGINT because totals can reasonably exceed 2.1B
-- minor units (especially for SLs handling property or M&A flows). Currency
-- conversion fields are independent — converted_total_cents is the
-- amount-in-tenant's-base-currency, populated when the source currency
-- differs (Phase 5 hooks the ECB FX rates table here).

BEGIN;

CREATE TABLE IF NOT EXISTS tax.transaction (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,

  -- Identification
  name                        text,
  description                 text,
  merchant                    text,
  note                        text,
  text                        text,                       -- raw OCR/import text for re-categorisation

  -- Money
  total_cents                 bigint,
  currency_code               text REFERENCES tax.currency(code),
  converted_total_cents       bigint,                     -- in tenant's base currency
  converted_currency_code     text REFERENCES tax.currency(code),
  realized_fx_gain_cents      bigint,

  -- Classification
  type                        text NOT NULL DEFAULT 'expense',
  status                      text NOT NULL DEFAULT 'business',  -- business | personal | mixed
  deductible                  boolean,

  -- Foreign keys (composite to enforce same-tenant)
  account_id                  uuid,
  counter_account_id          uuid,
  category_code               text,
  project_code                text,
  applied_rule_id             uuid,

  -- Transfer pairing
  transfer_id                 uuid,
  transfer_direction          text,

  -- Extra payload
  file_ids                    uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  items                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra                       jsonb,

  issued_at                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Same-tenant FK pairs lean on the (tenant_id, *) UNIQUE indexes added in
  -- earlier migrations. SET NULL on account delete keeps history intact.
  CONSTRAINT transaction_account_fk
    FOREIGN KEY (tenant_id, account_id)
    REFERENCES tax.account(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT transaction_counter_account_fk
    FOREIGN KEY (tenant_id, counter_account_id)
    REFERENCES tax.account(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT transaction_category_fk
    FOREIGN KEY (tenant_id, category_code)
    REFERENCES tax.category(tenant_id, code) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT transaction_project_fk
    FOREIGN KEY (tenant_id, project_code)
    REFERENCES tax.project(tenant_id, code) ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT transaction_type_valid              CHECK (type   IN ('expense','income','transfer')),
  CONSTRAINT transaction_status_valid            CHECK (status IN ('business','personal','mixed')),
  CONSTRAINT transaction_transfer_direction_valid CHECK (transfer_direction IS NULL OR transfer_direction IN ('outgoing','incoming')),
  -- For type='transfer' the pair is bound by transfer_id and direction.
  CONSTRAINT transaction_transfer_paired         CHECK (
    (type <> 'transfer') OR (transfer_id IS NOT NULL AND transfer_direction IS NOT NULL)
  )
);
ALTER TABLE tax.transaction OWNER TO db_owner;
ALTER TABLE tax.transaction ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.transaction;
CREATE POLICY tenant_isolation ON tax.transaction
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS transaction_tenant_issued_idx     ON tax.transaction (tenant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS transaction_tenant_account_idx    ON tax.transaction (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS transaction_tenant_category_idx   ON tax.transaction (tenant_id, category_code);
CREATE INDEX IF NOT EXISTS transaction_tenant_project_idx    ON tax.transaction (tenant_id, project_code);
CREATE INDEX IF NOT EXISTS transaction_tenant_merchant_idx   ON tax.transaction (tenant_id, lower(merchant));
CREATE INDEX IF NOT EXISTS transaction_tenant_transfer_idx   ON tax.transaction (tenant_id, transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transaction_tenant_orphan_xfer_idx ON tax.transaction (tenant_id) WHERE type = 'transfer' AND transfer_id IS NULL;
CREATE INDEX IF NOT EXISTS transaction_tenant_crypto_idx     ON tax.transaction (tenant_id) WHERE extra ? 'crypto';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_transaction') THEN
    CREATE TRIGGER set_updated_at_transaction BEFORE UPDATE ON tax.transaction
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.transaction TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.transaction TO platform_admin;

COMMIT;
