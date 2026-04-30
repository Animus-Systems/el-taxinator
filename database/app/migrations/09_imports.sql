-- App DB: import sessions (CSV / wizard / API ingestion of transactions).
--
-- Each session is one "round" of importing — the user uploads a CSV, the AI
-- chats about column mapping + categorisation, then commits N rows into
-- tax.transaction. We keep:
--   * status: pending → active → completed | cancelled
--   * column_mapping: which CSV column maps to which transaction field
--   * ai_messages: chat history for context when the user comes back later
--   * business_context_snapshot: tenant config at session start (entity_type,
--     turnover, deadlines) so a session re-opened months later still knows
--     what the rules were
--   * context_file_ids: extra docs the user attached for the AI to read
--     (e.g. last quarter's IRPF form, a vendor invoice template)

BEGIN;

CREATE TABLE IF NOT EXISTS tax.import_session (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  account_id                  uuid,
  file_id                     uuid,                    -- source CSV/PDF in tax.file
  source                      text NOT NULL DEFAULT 'csv',
  status                      text NOT NULL DEFAULT 'pending',
  file_name                   text,
  column_mapping              jsonb,
  ai_messages                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  business_context_snapshot   jsonb,
  context_file_ids            uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  total_rows                  int NOT NULL DEFAULT 0,
  processed_rows              int NOT NULL DEFAULT 0,
  error_count                 int NOT NULL DEFAULT 0,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_account_fk FOREIGN KEY (tenant_id, account_id)
    REFERENCES tax.account(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT import_file_fk    FOREIGN KEY (tenant_id, file_id)
    REFERENCES tax.file(tenant_id, id)    ON DELETE SET NULL,
  CONSTRAINT import_source_valid CHECK (source IN ('csv','pdf','wizard','api')),
  CONSTRAINT import_status_valid CHECK (status IN ('pending','active','completed','cancelled'))
);
ALTER TABLE tax.import_session OWNER TO db_owner;
ALTER TABLE tax.import_session ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.import_session;
CREATE POLICY tenant_isolation ON tax.import_session
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS import_session_tenant_status_idx
  ON tax.import_session (tenant_id, status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_import_session') THEN
    CREATE TRIGGER set_updated_at_import_session BEFORE UPDATE ON tax.import_session
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

-- tax.file gets a unique index needed by the FK above. We never created
-- file rows duplicated within a tenant, so this should add no rows but
-- guarantees the (tenant_id, id) pair is unique for join targets.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'tax' AND indexname = 'file_tenant_id_unique'
  ) THEN
    CREATE UNIQUE INDEX file_tenant_id_unique ON tax.file (tenant_id, id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.import_session TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.import_session TO platform_admin;

COMMIT;
