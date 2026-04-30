-- App DB: contacts (clients + suppliers).
--
-- Single table for both sides of the business relationship. `role` says which
-- direction this contact participates in (`client` for invoices we issue,
-- `supplier` for purchase invoices we receive, `both` when the same legal
-- entity is on both sides — common for partner businesses).

BEGIN;

CREATE TABLE IF NOT EXISTS tax.contact (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         citext,
  phone         text,
  mobile        text,
  address       text,
  city          text,
  postal_code   text,
  province      text,
  country       text,
  tax_id        text,
  bank_details  text,
  notes         text,
  role          text NOT NULL DEFAULT 'client',
  kind          text NOT NULL DEFAULT 'company',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT contact_role_valid CHECK (role IN ('client','supplier','both')),
  CONSTRAINT contact_kind_valid CHECK (kind IN ('company','person'))
);
ALTER TABLE tax.contact OWNER TO db_owner;
ALTER TABLE tax.contact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.contact;
CREATE POLICY tenant_isolation ON tax.contact
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS contact_tenant_role_idx ON tax.contact (tenant_id, role);
CREATE INDEX IF NOT EXISTS contact_tenant_name_idx ON tax.contact (tenant_id, lower(name));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_contact') THEN
    CREATE TRIGGER set_updated_at_contact BEFORE UPDATE ON tax.contact
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.contact TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.contact TO platform_admin;

COMMIT;
