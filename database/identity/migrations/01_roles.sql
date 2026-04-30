-- Identity DB bootstrap: roles
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§4.2, §14.2.2)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_owner') THEN
    CREATE ROLE identity_owner NOLOGIN;
  ELSE
    ALTER ROLE identity_owner NOLOGIN;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_migrator') THEN
    CREATE ROLE identity_migrator LOGIN;
  ELSE
    ALTER ROLE identity_migrator LOGIN NOBYPASSRLS;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_app') THEN
    CREATE ROLE identity_app LOGIN;
  ELSE
    ALTER ROLE identity_app LOGIN NOBYPASSRLS;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_breakglass') THEN
    BEGIN
      CREATE ROLE identity_breakglass LOGIN NOINHERIT BYPASSRLS CONNECTION LIMIT 1;
    EXCEPTION
      WHEN insufficient_privilege THEN
        -- Managed Postgres providers may disallow BYPASSRLS.
        -- Fall back to an owner-role bypass pattern (see 05_rls.sql for FORCE RLS conditional).
        CREATE ROLE identity_breakglass LOGIN NOINHERIT CONNECTION LIMIT 1;
        RAISE NOTICE 'identity_breakglass BYPASSRLS not permitted; created without BYPASSRLS';
    END;
  ELSE
    BEGIN
      ALTER ROLE identity_breakglass LOGIN NOINHERIT BYPASSRLS CONNECTION LIMIT 1;
    EXCEPTION
      WHEN insufficient_privilege THEN
        ALTER ROLE identity_breakglass LOGIN NOINHERIT NOBYPASSRLS CONNECTION LIMIT 1;
        RAISE NOTICE 'identity_breakglass BYPASSRLS not permitted; ensured NOBYPASSRLS';
    END;
  END IF;
END $$;

-- Optional operator/read-only role (admin views only; no base-table grants).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_readonly') THEN
    CREATE ROLE identity_readonly NOLOGIN;
  ELSE
    ALTER ROLE identity_readonly NOLOGIN;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'identity_readonly_login') THEN
    CREATE ROLE identity_readonly_login LOGIN;
  ELSE
    ALTER ROLE identity_readonly_login LOGIN NOBYPASSRLS;
  END IF;
END $$;

-- Allow migrator to `SET ROLE identity_owner` to create/own objects as the locked owner role.
GRANT identity_owner TO identity_migrator;

-- Fallback breakglass for managed clusters:
-- If BYPASSRLS is unavailable, breakglass can SET ROLE identity_owner (table owner bypass) when FORCE RLS is disabled.
GRANT identity_owner TO identity_breakglass;

GRANT identity_readonly TO identity_readonly_login;

COMMIT;
