-- App DB: knowledge packs (curated tax content) + chat history.
--
-- knowledge_pack is per-tenant content (e.g. "irpf_deductions",
-- "vat_quarterly") that the AI keeps fresh. The refresh state machine
-- (idle → in_progress → review_pending → idle) lets the wizard show
-- "regenerating…" indicators without blocking other tabs.
--
-- chat_message is per-tenant + per-user — same RLS pattern as past_search:
-- accountant members of a tenant don't read the owner's bookkeeping
-- conversations. There's at most one role='system' message per (tenant,
-- user) — that's the rolling system summary the chat handler keeps
-- updating as the conversation grows past the context window.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.knowledge_pack (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  slug                     text NOT NULL,
  title                    text NOT NULL,
  content                  text NOT NULL,
  source_prompt            text,
  last_refreshed_at        timestamptz,
  refresh_interval_days    int NOT NULL DEFAULT 30,
  provider                 text,
  model                    text,
  review_status            text NOT NULL DEFAULT 'verified',
  refresh_state            text NOT NULL DEFAULT 'idle',
  refresh_message          text,
  refresh_started_at       timestamptz,
  refresh_finished_at      timestamptz,
  refresh_heartbeat_at     timestamptz,
  pending_review_content   text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  CONSTRAINT knowledge_pack_review_valid  CHECK (review_status IN ('verified','pending_review','stale')),
  CONSTRAINT knowledge_pack_refresh_valid CHECK (refresh_state  IN ('idle','in_progress','review_pending','failed'))
);
ALTER TABLE tax.knowledge_pack OWNER TO db_owner;
ALTER TABLE tax.knowledge_pack ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.knowledge_pack;
CREATE POLICY tenant_isolation ON tax.knowledge_pack
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS knowledge_pack_tenant_idx ON tax.knowledge_pack (tenant_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_knowledge_pack') THEN
    CREATE TRIGGER set_updated_at_knowledge_pack BEFORE UPDATE ON tax.knowledge_pack
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.knowledge_pack TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.knowledge_pack TO platform_admin;

CREATE TABLE IF NOT EXISTS tax.chat_message (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  role        text NOT NULL,
  content     text NOT NULL,
  metadata    jsonb,
  status      text NOT NULL DEFAULT 'sent',
  applied_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_role_valid   CHECK (role   IN ('user','assistant','system','tool')),
  CONSTRAINT chat_message_status_valid CHECK (status IN ('sent','applied','failed','draft'))
);
ALTER TABLE tax.chat_message OWNER TO db_owner;
ALTER TABLE tax.chat_message ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.chat_message;
CREATE POLICY tenant_isolation ON tax.chat_message
  USING (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id())
  WITH CHECK (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id());

CREATE INDEX IF NOT EXISTS chat_message_tenant_user_created_idx
  ON tax.chat_message (tenant_id, user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_message_system_summary_idx
  ON tax.chat_message (tenant_id, user_id) WHERE role = 'system';

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.chat_message TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.chat_message TO platform_admin;

COMMIT;
