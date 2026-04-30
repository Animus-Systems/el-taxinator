-- App DB: per-tenant chart-of-accounts taxonomy.
--
-- `tax.category` and `tax.project` are the labels users attach to transactions
-- and invoice lines. Both are tenant-scoped via RLS; both keep a stable `code`
-- (slug-ish) that downstream rows reference rather than the UUID. Codes are
-- unique per tenant so the same string can mean different things in different
-- businesses (e.g. "office" maps to a different category for an autonomo vs an
-- SL).

BEGIN;

-- tax.category --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax.category (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  -- 'income' | 'expense' | 'crypto_disposal' (mirrors legacy taxinator semantics)
  kind          text NOT NULL DEFAULT 'expense',
  color         text NOT NULL DEFAULT '#000000',
  llm_prompt    text,
  tax_form_ref  text,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  CONSTRAINT category_kind_valid  CHECK (kind  IN ('income','expense','crypto_disposal')),
  CONSTRAINT category_code_format CHECK (code ~ '^[a-z0-9_-]+$' AND length(code) BETWEEN 1 AND 60)
);
ALTER TABLE tax.category OWNER TO db_owner;
ALTER TABLE tax.category ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.category;
CREATE POLICY tenant_isolation ON tax.category
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS category_tenant_kind_idx ON tax.category (tenant_id, kind);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_category') THEN
    CREATE TRIGGER set_updated_at_category BEFORE UPDATE ON tax.category
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.category TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.category TO platform_admin;

-- tax.project ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax.project (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#000000',
  llm_prompt  text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  CONSTRAINT project_code_format CHECK (code ~ '^[a-z0-9_-]+$' AND length(code) BETWEEN 1 AND 60)
);
ALTER TABLE tax.project OWNER TO db_owner;
ALTER TABLE tax.project ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.project;
CREATE POLICY tenant_isolation ON tax.project
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_project') THEN
    CREATE TRIGGER set_updated_at_project BEFORE UPDATE ON tax.project
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.project TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.project TO platform_admin;

COMMIT;
