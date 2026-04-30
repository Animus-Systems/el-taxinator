-- App DB: outgoing invoices + line items + payment allocations.
--
-- An invoice is an issued bill — once `status='issued'` the row is the
-- legal record (Spanish autonomos must keep an unbroken libro de facturas
-- emitidas). Two kinds:
--   * `invoice`    — full factura ordinaria
--   * `simplified` — factura simplificada / ticket
--
-- Non-EUR invoices carry FX context (rate + date + source) so the
-- converted total stays auditable years later — recomputing FX on demand
-- would drift over time.
--
-- invoice_payment is a join row that allocates a portion of one
-- transaction (tax.transaction) to an invoice. Multiple partial payments
-- across different transactions / dates are allowed; UNIQUE on
-- (invoice_id, transaction_id) prevents allocating the same transaction
-- twice to the same invoice.

BEGIN;

-- tax.transaction needs a (tenant_id, id) UNIQUE for the composite FK from
-- tax.invoice_payment below. Put this first so the FK creation succeeds.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'tax' AND indexname = 'transaction_tenant_id_unique'
  ) THEN
    CREATE UNIQUE INDEX transaction_tenant_id_unique ON tax.transaction (tenant_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tax.invoice (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  contact_id          uuid,
  quote_id            uuid,
  pdf_file_id         uuid,
  template_id         uuid,
  number              text NOT NULL,
  status              text NOT NULL DEFAULT 'draft',
  kind                text NOT NULL DEFAULT 'invoice',
  issue_date          date NOT NULL,
  due_date            date,
  paid_at             timestamptz,
  notes               text,
  currency_code       text NOT NULL DEFAULT 'EUR' REFERENCES tax.currency(code),
  total_cents         bigint,
  irpf_rate           numeric(5, 2) NOT NULL DEFAULT 0,
  -- FX block (frozen at issue time for audit).
  fx_rate_to_eur      numeric(20, 10),
  fx_rate_date        date,
  fx_rate_source      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, quote_id),
  CONSTRAINT invoice_contact_fk    FOREIGN KEY (tenant_id, contact_id)   REFERENCES tax.contact(tenant_id, id)         ON DELETE SET NULL,
  CONSTRAINT invoice_quote_fk      FOREIGN KEY (tenant_id, quote_id)     REFERENCES tax.quote(tenant_id, id)           ON DELETE SET NULL,
  CONSTRAINT invoice_pdf_file_fk   FOREIGN KEY (tenant_id, pdf_file_id)  REFERENCES tax.file(tenant_id, id)            ON DELETE SET NULL,
  CONSTRAINT invoice_template_fk   FOREIGN KEY (tenant_id, template_id)  REFERENCES tax.invoice_template(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT invoice_status_valid  CHECK (status IN ('draft','issued','paid','cancelled','void')),
  CONSTRAINT invoice_kind_valid    CHECK (kind   IN ('invoice','simplified')),
  CONSTRAINT invoice_irpf_range    CHECK (irpf_rate BETWEEN 0 AND 100)
);
ALTER TABLE tax.invoice OWNER TO db_owner;
ALTER TABLE tax.invoice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.invoice;
CREATE POLICY tenant_isolation ON tax.invoice
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS invoice_tenant_status_idx       ON tax.invoice (tenant_id, status);
CREATE INDEX IF NOT EXISTS invoice_tenant_kind_idx         ON tax.invoice (tenant_id, kind);
CREATE INDEX IF NOT EXISTS invoice_tenant_issued_idx       ON tax.invoice (tenant_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS invoice_tenant_contact_idx      ON tax.invoice (tenant_id, contact_id) WHERE contact_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_invoice') THEN
    CREATE TRIGGER set_updated_at_invoice BEFORE UPDATE ON tax.invoice
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.invoice TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.invoice TO platform_admin;

-- Line items.
CREATE TABLE IF NOT EXISTS tax.invoice_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL,
  product_id       uuid,
  description      text NOT NULL,
  quantity         numeric(20, 4) NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL,
  vat_rate         numeric(5, 2) NOT NULL DEFAULT 21,
  position         int NOT NULL DEFAULT 0,
  CONSTRAINT invoice_item_invoice_fk  FOREIGN KEY (tenant_id, invoice_id)  REFERENCES tax.invoice(tenant_id, id)  ON DELETE CASCADE,
  CONSTRAINT invoice_item_product_fk  FOREIGN KEY (tenant_id, product_id)  REFERENCES tax.product(tenant_id, id)  ON DELETE SET NULL,
  CONSTRAINT invoice_item_quantity_positive CHECK (quantity >= 0),
  CONSTRAINT invoice_item_vat_range   CHECK (vat_rate BETWEEN 0 AND 100)
);
ALTER TABLE tax.invoice_item OWNER TO db_owner;
ALTER TABLE tax.invoice_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.invoice_item;
CREATE POLICY tenant_isolation ON tax.invoice_item
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS invoice_item_invoice_idx ON tax.invoice_item (tenant_id, invoice_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.invoice_item TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.invoice_item TO platform_admin;

-- Payment allocations: invoice ↔ transaction join with the cents allocated.
CREATE TABLE IF NOT EXISTS tax.invoice_payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL,
  transaction_id  uuid NOT NULL,
  amount_cents    bigint NOT NULL,
  note            text,
  source          text NOT NULL DEFAULT 'manual',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_id, transaction_id),
  CONSTRAINT invoice_payment_invoice_fk      FOREIGN KEY (tenant_id, invoice_id)     REFERENCES tax.invoice(tenant_id, id)     ON DELETE CASCADE,
  CONSTRAINT invoice_payment_transaction_fk  FOREIGN KEY (tenant_id, transaction_id) REFERENCES tax.transaction(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT invoice_payment_amount_nonzero  CHECK (amount_cents <> 0),
  CONSTRAINT invoice_payment_source_valid    CHECK (source IN ('manual','rule','import'))
);
ALTER TABLE tax.invoice_payment OWNER TO db_owner;
ALTER TABLE tax.invoice_payment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.invoice_payment;
CREATE POLICY tenant_isolation ON tax.invoice_payment
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS invoice_payment_invoice_idx     ON tax.invoice_payment (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payment_transaction_idx ON tax.invoice_payment (tenant_id, transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.invoice_payment TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.invoice_payment TO platform_admin;

COMMIT;
