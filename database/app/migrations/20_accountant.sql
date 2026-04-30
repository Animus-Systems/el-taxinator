-- App DB: accountant comments on entities.
--
-- An accountant member can attach commentary to any tenant-scoped entity
-- (transaction, invoice, purchase, tax_filing, chat thread, etc.). Comments
-- live on a single table keyed by (entity_type, entity_id) so we don't
-- proliferate one comment-table-per-domain. Anyone in the tenant can read
-- them; only the author can update/delete.
--
-- entity_id is stored as text (not uuid) because entity_type='chat_thread'
-- might one day key on the (user_id, role='system') tuple rather than a
-- single uuid. Today every callsite uses a uuid.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.accountant_comment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,                -- author
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accountant_comment_entity_type_valid CHECK (
    entity_type IN ('transaction','invoice','purchase','quote','tax_filing','contact','file','knowledge_pack')
  ),
  CONSTRAINT accountant_comment_body_nonempty CHECK (length(trim(body)) > 0)
);
ALTER TABLE tax.accountant_comment OWNER TO db_owner;
ALTER TABLE tax.accountant_comment ENABLE ROW LEVEL SECURITY;

-- Two policies:
--   * `tenant_read`  — anyone in the tenant can SELECT
--   * `author_write` — only the author can UPDATE/DELETE; anyone in the
--     tenant can INSERT (their own user_id only via WITH CHECK)
DROP POLICY IF EXISTS tenant_read   ON tax.accountant_comment;
DROP POLICY IF EXISTS author_write  ON tax.accountant_comment;

CREATE POLICY tenant_read ON tax.accountant_comment FOR SELECT
  USING (tenant_id = core.current_tenant_id());

CREATE POLICY author_write ON tax.accountant_comment FOR ALL
  USING (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id())
  WITH CHECK (tenant_id = core.current_tenant_id() AND user_id = core.current_user_id());

CREATE INDEX IF NOT EXISTS accountant_comment_tenant_entity_idx
  ON tax.accountant_comment (tenant_id, entity_type, entity_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_accountant_comment') THEN
    CREATE TRIGGER set_updated_at_accountant_comment BEFORE UPDATE ON tax.accountant_comment
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.accountant_comment TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.accountant_comment TO platform_admin;

COMMIT;
