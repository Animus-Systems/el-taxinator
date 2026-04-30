-- App DB: crypto FIFO inventory + disposal matches.
--
-- A `crypto_lot` is one acquisition: bought 0.5 BTC at 50_000 EUR/coin
-- inclusive of fees. `quantity_remaining` shrinks as later disposals consume
-- it under FIFO. `crypto_disposal_match` is the audit row created when a
-- disposal is matched against one or more lots — it FREEZES cost basis,
-- proceeds, and realised gain at match time so re-categorisation later can't
-- silently change a tax-year's reported numbers.
--
-- Both tables are per-tenant (a personal tenant tracks personal crypto, a
-- business tenant tracks the business's holdings — same schema, different
-- tenant_id). Quantities use NUMERIC(28,12) — enough headroom for satoshi-
-- accurate balances on 8-decimal assets and Wei on Ethereum-style 18-decimal
-- assets without rounding drift.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.crypto_lot (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  asset                  text NOT NULL,
  asset_class            text NOT NULL DEFAULT 'crypto',
  acquired_at            timestamptz NOT NULL,
  quantity_total         numeric(28, 12) NOT NULL,
  quantity_remaining     numeric(28, 12) NOT NULL,
  cost_per_unit_cents    bigint NOT NULL,
  fees_cents             bigint NOT NULL DEFAULT 0,
  source_transaction_id  uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT crypto_lot_qty_total_pos      CHECK (quantity_total > 0),
  CONSTRAINT crypto_lot_qty_remaining_ok   CHECK (quantity_remaining >= 0 AND quantity_remaining <= quantity_total),
  CONSTRAINT crypto_lot_cost_nonneg        CHECK (cost_per_unit_cents >= 0),
  CONSTRAINT crypto_lot_source_tx_fk FOREIGN KEY (tenant_id, source_transaction_id)
    REFERENCES tax.transaction(tenant_id, id) ON DELETE SET NULL
);
ALTER TABLE tax.crypto_lot OWNER TO db_owner;
ALTER TABLE tax.crypto_lot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.crypto_lot;
CREATE POLICY tenant_isolation ON tax.crypto_lot
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS crypto_lot_tenant_asset_remaining_idx
  ON tax.crypto_lot (tenant_id, asset, acquired_at) WHERE quantity_remaining > 0;
CREATE INDEX IF NOT EXISTS crypto_lot_tenant_idx ON tax.crypto_lot (tenant_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_crypto_lot') THEN
    CREATE TRIGGER set_updated_at_crypto_lot BEFORE UPDATE ON tax.crypto_lot
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.crypto_lot TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.crypto_lot TO platform_admin;

CREATE TABLE IF NOT EXISTS tax.crypto_disposal_match (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  disposal_transaction_id  uuid NOT NULL,
  lot_id                   uuid NOT NULL,
  asset                    text NOT NULL,
  asset_class              text NOT NULL DEFAULT 'crypto',
  quantity_consumed        numeric(28, 12) NOT NULL,
  cost_basis_cents         bigint NOT NULL,
  proceeds_cents           bigint NOT NULL,
  realized_gain_cents      bigint NOT NULL,
  matched_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crypto_match_disposal_fk FOREIGN KEY (tenant_id, disposal_transaction_id)
    REFERENCES tax.transaction(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT crypto_match_lot_fk FOREIGN KEY (tenant_id, lot_id)
    REFERENCES tax.crypto_lot(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT crypto_match_qty_pos CHECK (quantity_consumed > 0)
);
ALTER TABLE tax.crypto_disposal_match OWNER TO db_owner;
ALTER TABLE tax.crypto_disposal_match ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.crypto_disposal_match;
CREATE POLICY tenant_isolation ON tax.crypto_disposal_match
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS crypto_match_tenant_idx           ON tax.crypto_disposal_match (tenant_id);
CREATE INDEX IF NOT EXISTS crypto_match_disposal_idx         ON tax.crypto_disposal_match (tenant_id, disposal_transaction_id);
-- "Disposals for tax year X" queries hit the tenant index + a WHERE on
-- matched_at >= 'YYYY-01-01' AND < (YYYY+1)-01-01. We skip a year-extract
-- expression index because EXTRACT(... FROM timestamptz) is STABLE not
-- IMMUTABLE (it depends on the session timezone) so Postgres rejects it.
CREATE INDEX IF NOT EXISTS crypto_match_tenant_matched_idx   ON tax.crypto_disposal_match (tenant_id, matched_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.crypto_disposal_match TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.crypto_disposal_match TO platform_admin;

COMMIT;
