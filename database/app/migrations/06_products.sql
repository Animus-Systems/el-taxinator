-- App DB: products (line items reused across invoices and quotes).
--
-- `price_cents` keeps invoice totals exact under the integer-cents convention
-- the rest of the domain uses (matches legacy `total integer`). VAT lives on
-- the product as a default; an invoice line can override.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.product (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  price_cents    bigint NOT NULL DEFAULT 0,
  currency_code  text NOT NULL DEFAULT 'EUR' REFERENCES tax.currency(code),
  vat_rate       numeric(5,2) NOT NULL DEFAULT 21.00,
  unit           text,
  is_archived    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT product_price_nonneg CHECK (price_cents >= 0),
  CONSTRAINT product_vat_range    CHECK (vat_rate BETWEEN 0 AND 100)
);
ALTER TABLE tax.product OWNER TO db_owner;
ALTER TABLE tax.product ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.product;
CREATE POLICY tenant_isolation ON tax.product
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS product_tenant_active_idx
  ON tax.product (tenant_id) WHERE NOT is_archived;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_product') THEN
    CREATE TRIGGER set_updated_at_product BEFORE UPDATE ON tax.product
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.product TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.product TO platform_admin;

COMMIT;
