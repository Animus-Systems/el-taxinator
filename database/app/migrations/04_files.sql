-- App DB: file metadata.
--
-- Phase 3 only stores the metadata; multer-driven on-disk uploads land in
-- Phase 4. `path` is the relative path inside UPLOAD_DIR (already
-- tenant-scoped at that level). `cid` is reserved for the future
-- content-addressed storage migration: when CIDs come online `path` becomes
-- nullable and the download handler resolves CID via the storage backend.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.file (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  filename             text NOT NULL,
  path                 text,
  cid                  text,
  mimetype             text NOT NULL,
  sha256               text,
  size_bytes           bigint,
  metadata             jsonb,
  cached_parse_result  jsonb,
  is_reviewed          boolean NOT NULL DEFAULT false,
  is_splitted          boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT file_path_or_cid CHECK (path IS NOT NULL OR cid IS NOT NULL)
);
ALTER TABLE tax.file OWNER TO db_owner;
ALTER TABLE tax.file ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tax.file;
CREATE POLICY tenant_isolation ON tax.file
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE INDEX IF NOT EXISTS file_tenant_reviewed_created_idx
  ON tax.file (tenant_id, is_reviewed, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_file') THEN
    CREATE TRIGGER set_updated_at_file BEFORE UPDATE ON tax.file
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tax.file TO app_runtime, tenant_admin;
GRANT ALL                            ON tax.file TO platform_admin;

COMMIT;
