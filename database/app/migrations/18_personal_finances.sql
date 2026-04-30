-- App DB: personal IRPF inputs.
--
-- These two tables only make sense in a personal tenant (entity_type='individual')
-- though we don't enforce that at the schema level — an autonomo can also
-- carry an income_source for a side gig that gets aggregated into the
-- personal tax return. RLS still scopes everything per tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.income_source (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  name        text NOT NULL,
  tax_id      text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT income_source_kind_valid CHECK (
    kind IN ('salary','self_employment','dividends','interest','rental','royalty','pension','other')
  )
);
ALTER TABLE tax.income_source OWNER TO db_owner;
ALTER TABLE tax.income_source ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.income_source;
CREATE POLICY tenant_isolation ON tax.income_source
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS income_source_tenant_kind_idx ON tax.income_source (tenant_id, kind);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_income_source') THEN
    CREATE TRIGGER set_updated_at_income_source BEFORE UPDATE ON tax.income_source
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.income_source TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.income_source TO platform_admin;

CREATE TABLE IF NOT EXISTS tax.personal_deduction (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  tax_year      int NOT NULL,
  amount_cents  bigint NOT NULL,
  description   text,
  file_id       uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_deduction_year_range  CHECK (tax_year BETWEEN 1990 AND 2100),
  CONSTRAINT personal_deduction_amount_pos  CHECK (amount_cents > 0),
  CONSTRAINT personal_deduction_file_fk FOREIGN KEY (tenant_id, file_id)
    REFERENCES tax.file(tenant_id, id) ON DELETE SET NULL
);
ALTER TABLE tax.personal_deduction OWNER TO db_owner;
ALTER TABLE tax.personal_deduction ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.personal_deduction;
CREATE POLICY tenant_isolation ON tax.personal_deduction
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS personal_deduction_tenant_year_idx ON tax.personal_deduction (tenant_id, tax_year);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_personal_deduction') THEN
    CREATE TRIGGER set_updated_at_personal_deduction BEFORE UPDATE ON tax.personal_deduction
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.personal_deduction TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.personal_deduction TO platform_admin;

COMMIT;
