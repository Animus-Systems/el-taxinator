-- App DB: AI-learned business context (key/value/jsonb).
--
-- The wizard learns things about the tenant's business — entity_type,
-- expected annual turnover, default project, quarterly filing deadlines —
-- and persists them here so subsequent sessions can stay coherent.
-- `source` records who taught the system the fact (`wizard`, `manual`,
-- `import`); `learned_from_session_id` points back at the import session
-- that surfaced it, when applicable.

BEGIN;

-- tax.import_session needs (tenant_id, id) UNIQUE for the composite FK
-- below. Add it before the table that depends on it.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'tax' AND indexname = 'import_session_tenant_id_unique'
  ) THEN
    CREATE UNIQUE INDEX import_session_tenant_id_unique ON tax.import_session (tenant_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tax.business_fact (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  key                      text NOT NULL,
  value                    jsonb NOT NULL,
  source                   text NOT NULL DEFAULT 'wizard',
  learned_from_session_id  uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key),
  CONSTRAINT business_fact_source_valid CHECK (source IN ('wizard','manual','import')),
  CONSTRAINT business_fact_session_fk FOREIGN KEY (tenant_id, learned_from_session_id)
    REFERENCES tax.import_session(tenant_id, id) ON DELETE SET NULL
);
ALTER TABLE tax.business_fact OWNER TO db_owner;
ALTER TABLE tax.business_fact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.business_fact;
CREATE POLICY tenant_isolation ON tax.business_fact
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS business_fact_tenant_idx ON tax.business_fact (tenant_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_business_fact') THEN
    CREATE TRIGGER set_updated_at_business_fact BEFORE UPDATE ON tax.business_fact
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.business_fact TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.business_fact TO platform_admin;

COMMIT;
