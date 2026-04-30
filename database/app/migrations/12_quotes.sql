-- App DB: quotes (estimates / cotizaciones).
--
-- A quote is an unsigned offer to a contact. Once accepted it converts to
-- an invoice (Phase 5+ wires invoices.quote_id back here). Number is per-
-- tenant unique so each business runs its own series ("Q-2026-001" etc.).

BEGIN;

CREATE TABLE IF NOT EXISTS tax.quote (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  contact_id    uuid,
  pdf_file_id   uuid,
  template_id   uuid,
  number        text NOT NULL,
  status        text NOT NULL DEFAULT 'draft',
  issue_date    date NOT NULL,
  expiry_date   date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  CONSTRAINT quote_contact_fk     FOREIGN KEY (tenant_id, contact_id)         REFERENCES tax.contact(tenant_id, id)         ON DELETE SET NULL,
  CONSTRAINT quote_pdf_file_fk    FOREIGN KEY (tenant_id, pdf_file_id)        REFERENCES tax.file(tenant_id, id)            ON DELETE SET NULL,
  CONSTRAINT quote_template_fk    FOREIGN KEY (tenant_id, template_id)        REFERENCES tax.invoice_template(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT quote_status_valid   CHECK (status IN ('draft','sent','accepted','declined','expired'))
);
ALTER TABLE tax.quote OWNER TO db_owner;
ALTER TABLE tax.quote ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.quote;
CREATE POLICY tenant_isolation ON tax.quote
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS quote_tenant_status_idx ON tax.quote (tenant_id, status);
CREATE INDEX IF NOT EXISTS quote_tenant_issued_idx ON tax.quote (tenant_id, issue_date DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_quote') THEN
    CREATE TRIGGER set_updated_at_quote BEFORE UPDATE ON tax.quote
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.quote TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.quote TO platform_admin;

-- Line items. position keeps display order stable across edits.
CREATE TABLE IF NOT EXISTS tax.quote_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  quote_id        uuid NOT NULL,
  product_id      uuid,
  description     text NOT NULL,
  quantity        numeric(20, 4) NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL,
  vat_rate        numeric(5, 2) NOT NULL DEFAULT 21,
  position        int NOT NULL DEFAULT 0,
  CONSTRAINT quote_item_quote_fk   FOREIGN KEY (tenant_id, quote_id)    REFERENCES tax.quote(tenant_id, id)    ON DELETE CASCADE,
  CONSTRAINT quote_item_product_fk FOREIGN KEY (tenant_id, product_id)  REFERENCES tax.product(tenant_id, id)  ON DELETE SET NULL,
  CONSTRAINT quote_item_quantity_positive CHECK (quantity >= 0),
  CONSTRAINT quote_item_vat_range CHECK (vat_rate BETWEEN 0 AND 100)
);
ALTER TABLE tax.quote_item OWNER TO db_owner;
ALTER TABLE tax.quote_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.quote_item;
CREATE POLICY tenant_isolation ON tax.quote_item
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS quote_item_quote_idx ON tax.quote_item (tenant_id, quote_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.quote_item TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.quote_item TO platform_admin;

COMMIT;
