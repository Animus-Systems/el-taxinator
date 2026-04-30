-- App DB: tax filings (per year/quarter/modelo checklist).
--
-- One row = one Spanish modelo (130, 303, 390, 100, 200…) for a year, with
-- an optional quarter for those that file quarterly. `checklist` jsonb
-- carries the per-modelo to-do items the wizard generates. `filed_at`
-- transitions a row from "pending" to "filed"; `confirmation_number` and
-- `filed_amount_cents` are the audit trail you give an inspector.
--
-- Uniqueness is (tenant_id, year, COALESCE(quarter, -1), modelo_code) — a
-- partial UNIQUE INDEX since UNIQUE-on-COALESCE isn't expressible inline.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.tax_filing (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  year                 int NOT NULL,
  quarter              int,
  modelo_code          text NOT NULL,
  filed_at             timestamptz,
  checklist            jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                text,
  filed_amount_cents   bigint,
  confirmation_number  text,
  filing_source        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_filing_year_range    CHECK (year BETWEEN 1990 AND 2100),
  CONSTRAINT tax_filing_quarter_range CHECK (quarter IS NULL OR quarter BETWEEN 1 AND 4)
);
ALTER TABLE tax.tax_filing OWNER TO db_owner;
ALTER TABLE tax.tax_filing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.tax_filing;
CREATE POLICY tenant_isolation ON tax.tax_filing
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE UNIQUE INDEX IF NOT EXISTS tax_filing_unique_idx
  ON tax.tax_filing (tenant_id, year, COALESCE(quarter, -1), modelo_code);
CREATE INDEX IF NOT EXISTS tax_filing_tenant_year_idx ON tax.tax_filing (tenant_id, year);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_tax_filing') THEN
    CREATE TRIGGER set_updated_at_tax_filing BEFORE UPDATE ON tax.tax_filing
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.tax_filing TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.tax_filing TO platform_admin;

COMMIT;
