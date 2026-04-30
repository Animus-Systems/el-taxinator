-- App DB: incoming supplier invoices (libro de facturas recibidas).
--
-- Mirror of tax.invoice but for purchases received. `supplier_invoice_number`
-- is the *supplier's* number (we don't generate it), so per-supplier
-- duplicates are caught by UNIQUE (tenant_id, contact_id, supplier_invoice_number)
-- — though contact_id is nullable for one-off receipts where we don't keep
-- a contact, so the constraint is partial.
--
-- purchase_payment mirrors invoice_payment: allocate a tax.transaction to a
-- purchase. Same UNIQUE on (purchase_id, transaction_id).

BEGIN;

CREATE TABLE IF NOT EXISTS tax.purchase (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  contact_id               uuid,
  pdf_file_id              uuid,
  supplier_invoice_number  text NOT NULL,
  status                   text NOT NULL DEFAULT 'received',
  issue_date               date NOT NULL,
  due_date                 date,
  paid_at                  timestamptz,
  notes                    text,
  currency_code            text NOT NULL DEFAULT 'EUR' REFERENCES tax.currency(code),
  total_cents              bigint,
  irpf_rate                numeric(5, 2) NOT NULL DEFAULT 0,
  -- Frozen FX context (same shape as tax.invoice).
  fx_rate_to_eur           numeric(20, 10),
  fx_rate_date             date,
  fx_rate_source           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT purchase_contact_fk   FOREIGN KEY (tenant_id, contact_id)  REFERENCES tax.contact(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT purchase_pdf_file_fk  FOREIGN KEY (tenant_id, pdf_file_id) REFERENCES tax.file(tenant_id, id)    ON DELETE SET NULL,
  CONSTRAINT purchase_status_valid CHECK (status IN ('received','approved','paid','disputed','cancelled')),
  CONSTRAINT purchase_irpf_range   CHECK (irpf_rate BETWEEN 0 AND 100)
);
ALTER TABLE tax.purchase OWNER TO db_owner;
ALTER TABLE tax.purchase ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.purchase;
CREATE POLICY tenant_isolation ON tax.purchase
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

-- Same supplier shouldn't double-record the same invoice number; partial
-- because contact_id can be null for unreviewed receipts.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_supplier_invoice_uniq
  ON tax.purchase (tenant_id, contact_id, supplier_invoice_number) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_tenant_status_idx     ON tax.purchase (tenant_id, status);
CREATE INDEX IF NOT EXISTS purchase_tenant_issued_idx     ON tax.purchase (tenant_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS purchase_tenant_contact_idx    ON tax.purchase (tenant_id, contact_id) WHERE contact_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_purchase') THEN
    CREATE TRIGGER set_updated_at_purchase BEFORE UPDATE ON tax.purchase
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.purchase TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.purchase TO platform_admin;

CREATE TABLE IF NOT EXISTS tax.purchase_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  purchase_id      uuid NOT NULL,
  product_id       uuid,
  description      text NOT NULL,
  quantity         numeric(20, 4) NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL,
  vat_rate         numeric(5, 2) NOT NULL DEFAULT 0,
  position         int NOT NULL DEFAULT 0,
  CONSTRAINT purchase_item_purchase_fk FOREIGN KEY (tenant_id, purchase_id) REFERENCES tax.purchase(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT purchase_item_product_fk  FOREIGN KEY (tenant_id, product_id)  REFERENCES tax.product(tenant_id, id)  ON DELETE SET NULL,
  CONSTRAINT purchase_item_quantity_positive CHECK (quantity >= 0),
  CONSTRAINT purchase_item_vat_range   CHECK (vat_rate BETWEEN 0 AND 100)
);
ALTER TABLE tax.purchase_item OWNER TO db_owner;
ALTER TABLE tax.purchase_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.purchase_item;
CREATE POLICY tenant_isolation ON tax.purchase_item
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS purchase_item_purchase_idx ON tax.purchase_item (tenant_id, purchase_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.purchase_item TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.purchase_item TO platform_admin;

CREATE TABLE IF NOT EXISTS tax.purchase_payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  purchase_id     uuid NOT NULL,
  transaction_id  uuid NOT NULL,
  amount_cents    bigint NOT NULL,
  note            text,
  source          text NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, purchase_id, transaction_id),
  CONSTRAINT purchase_payment_purchase_fk    FOREIGN KEY (tenant_id, purchase_id)    REFERENCES tax.purchase(tenant_id, id)    ON DELETE CASCADE,
  CONSTRAINT purchase_payment_transaction_fk FOREIGN KEY (tenant_id, transaction_id) REFERENCES tax.transaction(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT purchase_payment_amount_nonzero CHECK (amount_cents <> 0),
  CONSTRAINT purchase_payment_source_valid   CHECK (source IN ('manual','rule','import'))
);
ALTER TABLE tax.purchase_payment OWNER TO db_owner;
ALTER TABLE tax.purchase_payment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.purchase_payment;
CREATE POLICY tenant_isolation ON tax.purchase_payment
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS purchase_payment_purchase_idx    ON tax.purchase_payment (tenant_id, purchase_id);
CREATE INDEX IF NOT EXISTS purchase_payment_transaction_idx ON tax.purchase_payment (tenant_id, transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.purchase_payment TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.purchase_payment TO platform_admin;

COMMIT;
