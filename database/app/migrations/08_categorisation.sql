-- App DB: categorisation rules + receipt vendor aliases + past searches.
--
-- These are the "ML-lite" tables that feed the AI categorisation loop:
--   * categorization_rule — explicit user-defined / learned rules that map a
--     pattern (contains / regex / exact) on a field (merchant | description |
--     name) to a (category_code, project_code) tuple. `match_count` and
--     `last_applied_at` let the UI surface stale or low-confidence rules.
--   * receipt_vendor_alias — vendor→merchant pairings the LLM learns from
--     receipt OCR (e.g. "BAZAAR S.L." → "Amazon"). Cheap dedup for future
--     auto-categorisation.
--   * past_search — saved AI search results so we can hint "you've asked
--     this before" and avoid re-spending tokens on identical queries. Held
--     per user (RLS via tenant + nullable user_id).

BEGIN;

-- tax.categorization_rule ---------------------------------------------------
CREATE TABLE IF NOT EXISTS tax.categorization_rule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  match_type      text NOT NULL,
  match_field     text NOT NULL,
  match_value     text NOT NULL,
  category_code   text,
  project_code    text,
  is_active       boolean NOT NULL DEFAULT true,
  match_count     bigint NOT NULL DEFAULT 0,
  last_applied_at timestamptz,
  learn_reason    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT rule_match_type_valid  CHECK (match_type  IN ('contains','regex','exact')),
  CONSTRAINT rule_match_field_valid CHECK (match_field IN ('merchant','description','name','text')),
  CONSTRAINT rule_category_fk FOREIGN KEY (tenant_id, category_code)
    REFERENCES tax.category(tenant_id, code) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT rule_project_fk  FOREIGN KEY (tenant_id, project_code)
    REFERENCES tax.project(tenant_id, code)  ON UPDATE CASCADE ON DELETE SET NULL
);
ALTER TABLE tax.categorization_rule OWNER TO db_owner;
ALTER TABLE tax.categorization_rule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.categorization_rule;
CREATE POLICY tenant_isolation ON tax.categorization_rule
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS rule_tenant_active_idx
  ON tax.categorization_rule (tenant_id) WHERE is_active;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_categorization_rule') THEN
    CREATE TRIGGER set_updated_at_categorization_rule BEFORE UPDATE ON tax.categorization_rule
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.categorization_rule TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.categorization_rule TO platform_admin;

-- tax.receipt_vendor_alias --------------------------------------------------
CREATE TABLE IF NOT EXISTS tax.receipt_vendor_alias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  vendor_text   text NOT NULL,    -- raw OCR text
  merchant_text text NOT NULL,    -- canonical merchant name
  usage_count   bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tax.receipt_vendor_alias OWNER TO db_owner;
ALTER TABLE tax.receipt_vendor_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.receipt_vendor_alias;
CREATE POLICY tenant_isolation ON tax.receipt_vendor_alias
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

-- Case-insensitive uniqueness: same vendor text in same tenant maps once.
CREATE UNIQUE INDEX IF NOT EXISTS receipt_vendor_alias_unique
  ON tax.receipt_vendor_alias (tenant_id, lower(vendor_text));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_receipt_vendor_alias') THEN
    CREATE TRIGGER set_updated_at_receipt_vendor_alias BEFORE UPDATE ON tax.receipt_vendor_alias
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.receipt_vendor_alias TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.receipt_vendor_alias TO platform_admin;

-- tax.past_search ------------------------------------------------------------
-- Keyed by (tenant_id, user_id) so a user's saved searches stay private even
-- inside a shared tenant — the accountant role won't see the owner's
-- bookkeeping queries.
CREATE TABLE IF NOT EXISTS tax.past_search (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  query       text NOT NULL,
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tax.past_search OWNER TO db_owner;
ALTER TABLE tax.past_search ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.past_search;
CREATE POLICY tenant_isolation ON tax.past_search
  USING (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id())
  WITH CHECK (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id());

CREATE INDEX IF NOT EXISTS past_search_tenant_user_created_idx
  ON tax.past_search (tenant_id, user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON tax.past_search TO app_runtime, tenant_admin;
GRANT ALL                    ON tax.past_search TO platform_admin;

COMMIT;
