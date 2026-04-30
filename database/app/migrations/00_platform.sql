-- Taxinator app DB: platform bootstrap (extensions + roles + core schema + tenant model).
-- Greenfield baseline. All multi-tenant rows downstream rely on the helpers
-- and policies established here:
--   - core.current_tenant_id() reads app.tenant_id session var (set by appDb.withTenant).
--   - core.ensure_user_exists() projects identity_db users into core."user".
--   - core.tenant + core.tenant_member + core.tenant_invite hold the tenancy graph.
--   - RLS isolates per-tenant tables to the current tenant context.

BEGIN;

-- 1. Extensions ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END $$;

-- 2. Group roles (NOLOGIN) ---------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'db_owner') THEN CREATE ROLE db_owner NOLOGIN; ELSE ALTER ROLE db_owner NOLOGIN; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; ELSE ALTER ROLE anon NOLOGIN; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN CREATE ROLE app_runtime NOLOGIN; ELSE ALTER ROLE app_runtime NOLOGIN; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_admin') THEN CREATE ROLE tenant_admin NOLOGIN; ELSE ALTER ROLE tenant_admin NOLOGIN; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_admin') THEN
    BEGIN
      CREATE ROLE platform_admin NOLOGIN NOINHERIT BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      CREATE ROLE platform_admin NOLOGIN NOINHERIT;
      RAISE NOTICE 'platform_admin BYPASSRLS not permitted; created without BYPASSRLS';
    END;
  ELSE
    BEGIN
      ALTER ROLE platform_admin NOLOGIN NOINHERIT BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      ALTER ROLE platform_admin NOLOGIN NOINHERIT NOBYPASSRLS;
      RAISE NOTICE 'platform_admin BYPASSRLS not permitted; ensured NOBYPASSRLS';
    END;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_worker') THEN CREATE ROLE ops_worker NOLOGIN; ELSE ALTER ROLE ops_worker NOLOGIN; END IF;
END $$;

-- 3. Login roles -------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api_login') THEN CREATE ROLE app_api_login LOGIN; ELSE ALTER ROLE app_api_login LOGIN NOBYPASSRLS; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_admin_login') THEN CREATE ROLE tenant_admin_login LOGIN; ELSE ALTER ROLE tenant_admin_login LOGIN NOBYPASSRLS; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_admin_login') THEN CREATE ROLE platform_admin_login LOGIN; ELSE ALTER ROLE platform_admin_login LOGIN NOBYPASSRLS; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_login') THEN CREATE ROLE worker_login LOGIN; ELSE ALTER ROLE worker_login LOGIN NOBYPASSRLS; END IF;
END $$;

GRANT app_runtime    TO app_api_login;
GRANT tenant_admin   TO tenant_admin_login;
GRANT platform_admin TO platform_admin_login;
GRANT ops_worker     TO worker_login;
-- Owner-bypass fallback when BYPASSRLS isn't permitted (managed Postgres).
GRANT db_owner TO platform_admin;

-- 4. Schemas -----------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS core AUTHORIZATION db_owner;
ALTER  SCHEMA core OWNER TO db_owner;
CREATE SCHEMA IF NOT EXISTS ops  AUTHORIZATION db_owner;
ALTER  SCHEMA ops  OWNER TO db_owner;

REVOKE ALL ON SCHEMA core, ops FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA core, ops FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, ops FROM PUBLIC;
REVOKE ALL ON SCHEMA core, ops FROM anon;
GRANT  USAGE ON SCHEMA core, ops TO app_runtime, tenant_admin, ops_worker, platform_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE db_owner IN SCHEMA core REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE db_owner IN SCHEMA ops  REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- 5. Tenant context helper ---------------------------------------------------
CREATE OR REPLACE FUNCTION core.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;
ALTER FUNCTION core.current_tenant_id() OWNER TO db_owner;
REVOKE ALL ON FUNCTION core.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.current_tenant_id() TO app_runtime, tenant_admin, ops_worker, platform_admin;

CREATE OR REPLACE FUNCTION core.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid;
$$;
ALTER FUNCTION core.current_user_id() OWNER TO db_owner;
REVOKE ALL ON FUNCTION core.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.current_user_id() TO app_runtime, tenant_admin, ops_worker, platform_admin;

-- 6. Core entities -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.tenant (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  -- 'autonomo' | 'sl' | 'individual' (a personal tenant for the user's IRPF data)
  entity_type  text NOT NULL DEFAULT 'autonomo',
  metadata     jsonb,
  CONSTRAINT tenant_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT tenant_entity_type_valid CHECK (entity_type IN ('autonomo','sl','individual'))
);
ALTER TABLE core.tenant OWNER TO db_owner;

CREATE TABLE IF NOT EXISTS core."user" (
  id          uuid PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE core."user" OWNER TO db_owner;

CREATE OR REPLACE FUNCTION core.ensure_user_exists(p_user_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
  INSERT INTO core."user"(id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;
$$;
ALTER FUNCTION core.ensure_user_exists(uuid) OWNER TO db_owner;
REVOKE ALL ON FUNCTION core.ensure_user_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.ensure_user_exists(uuid) TO app_runtime, tenant_admin, ops_worker;

-- 7. Membership + invites + config ------------------------------------------
CREATE TABLE IF NOT EXISTS core.tenant_member (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES core."user"(id),
  role        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  invited_by  uuid REFERENCES core."user"(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id),
  CONSTRAINT tenant_member_role_valid   CHECK (role   IN ('owner','admin','accountant','member')),
  CONSTRAINT tenant_member_status_valid CHECK (status IN ('active','invited','suspended'))
);
ALTER TABLE core.tenant_member OWNER TO db_owner;
ALTER TABLE core.tenant_member ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.tenant_member;
CREATE POLICY tenant_isolation ON core.tenant_member
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE TABLE IF NOT EXISTS core.tenant_invite (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES core.tenant(id) ON DELETE CASCADE,
  email        citext NOT NULL,
  invited_by   uuid NOT NULL REFERENCES core."user"(id),
  role         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, id),
  CONSTRAINT tenant_invite_role_valid CHECK (role IN ('owner','admin','accountant','member'))
);
ALTER TABLE core.tenant_invite OWNER TO db_owner;
ALTER TABLE core.tenant_invite ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.tenant_invite;
CREATE POLICY tenant_isolation ON core.tenant_invite
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE TABLE IF NOT EXISTS core.tenant_config (
  tenant_id   uuid PRIMARY KEY REFERENCES core.tenant(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  value_json  jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE core.tenant_config OWNER TO db_owner;
ALTER TABLE core.tenant_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.tenant_config;
CREATE POLICY tenant_isolation ON core.tenant_config
  USING (tenant_id = core.current_tenant_id())
  WITH CHECK (tenant_id = core.current_tenant_id());

CREATE TABLE IF NOT EXISTS core.system_config (
  key         text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  value_json  jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE core.system_config OWNER TO db_owner;

-- 8. updated_at trigger reused across the schema ----------------------------
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
ALTER FUNCTION core.set_updated_at() OWNER TO db_owner;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_tenant')         THEN CREATE TRIGGER set_updated_at_tenant         BEFORE UPDATE ON core.tenant         FOR EACH ROW EXECUTE FUNCTION core.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_user')           THEN CREATE TRIGGER set_updated_at_user           BEFORE UPDATE ON core."user"        FOR EACH ROW EXECUTE FUNCTION core.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_tenant_member')  THEN CREATE TRIGGER set_updated_at_tenant_member  BEFORE UPDATE ON core.tenant_member  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_tenant_config')  THEN CREATE TRIGGER set_updated_at_tenant_config  BEFORE UPDATE ON core.tenant_config  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_system_config')  THEN CREATE TRIGGER set_updated_at_system_config  BEFORE UPDATE ON core.system_config  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at(); END IF;
END $$;

-- 9. Baseline grants ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tenant         TO platform_admin;
GRANT SELECT                          ON core.tenant         TO app_runtime, tenant_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tenant_member  TO app_runtime, tenant_admin;
GRANT ALL                             ON core.tenant_member  TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tenant_invite  TO app_runtime, tenant_admin;
GRANT ALL                             ON core.tenant_invite  TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tenant_config  TO app_runtime, tenant_admin;
GRANT ALL                             ON core.tenant_config  TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.system_config  TO platform_admin;
GRANT SELECT                          ON core."user"         TO app_runtime, tenant_admin, ops_worker, platform_admin;

COMMIT;
