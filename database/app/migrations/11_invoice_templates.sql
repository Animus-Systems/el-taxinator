-- App DB: per-tenant invoice/quote PDF templates.
--
-- Visual config for the rendered PDF: branding (logo, accent colour, font),
-- copy (header/footer/payment terms), and toggles (show VAT column, show
-- bank details). Per-tenant because two autonomos in the same workspace
-- bill under different brands. Exactly one default template per tenant —
-- enforced by a partial UNIQUE INDEX on `is_default = true`.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.invoice_template (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  is_default               boolean NOT NULL DEFAULT false,
  -- Logo and brand. logo_file_id points to a row in tax.file (composite FK
  -- so accidental cross-tenant template references are impossible).
  logo_file_id             uuid,
  logo_position            text NOT NULL DEFAULT 'left',
  accent_color             text NOT NULL DEFAULT '#4f46e5',
  font_preset              text NOT NULL DEFAULT 'helvetica',
  -- Copy
  header_text              text,
  footer_text              text,
  bank_details_text        text,
  business_details_text    text,
  below_totals_text        text,
  -- Display toggles
  show_prominent_total     boolean NOT NULL DEFAULT false,
  show_vat_column          boolean NOT NULL DEFAULT true,
  show_bank_details        boolean NOT NULL DEFAULT false,
  payment_terms_days       int,
  language                 text NOT NULL DEFAULT 'es',
  labels                   jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT template_logo_file_fk FOREIGN KEY (tenant_id, logo_file_id)
    REFERENCES tax.file(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT template_logo_position_valid CHECK (logo_position IN ('left','right','center')),
  CONSTRAINT template_font_preset_valid   CHECK (font_preset   IN ('helvetica','times','courier')),
  CONSTRAINT template_language_valid      CHECK (language      IN ('es','en'))
);
ALTER TABLE tax.invoice_template OWNER TO db_owner;
ALTER TABLE tax.invoice_template ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.invoice_template;
CREATE POLICY tenant_isolation ON tax.invoice_template
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS invoice_template_tenant_idx ON tax.invoice_template (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_template_default_uniq
  ON tax.invoice_template (tenant_id) WHERE is_default;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_invoice_template') THEN
    CREATE TRIGGER set_updated_at_invoice_template BEFORE UPDATE ON tax.invoice_template
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.invoice_template TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.invoice_template TO platform_admin;

COMMIT;
