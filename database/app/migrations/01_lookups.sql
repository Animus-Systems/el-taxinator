-- App DB: shared lookups (currencies + tax schema bootstrap).
--
-- Currencies are platform-global: every tenant references the same canonical
-- list. Custom per-tenant currencies are not in scope for Phase 3 (the legacy
-- `currencies.user_id` was nullable but ~always NULL). We can revisit if a
-- tenant ever needs a private fork of the list.

BEGIN;

-- 1. Domain schema -----------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tax AUTHORIZATION db_owner;
ALTER  SCHEMA tax OWNER TO db_owner;

REVOKE ALL ON SCHEMA tax FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA tax FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA tax FROM PUBLIC;
REVOKE ALL ON SCHEMA tax FROM anon;
GRANT  USAGE ON SCHEMA tax TO app_runtime, tenant_admin, ops_worker, platform_admin;
ALTER  DEFAULT PRIVILEGES FOR ROLE db_owner IN SCHEMA tax REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- 2. Global currency lookup --------------------------------------------------
CREATE TABLE IF NOT EXISTS tax.currency (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  symbol      text,
  decimals    int  NOT NULL DEFAULT 2,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT currency_code_format    CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_decimals_range CHECK (decimals BETWEEN 0 AND 6)
);
ALTER TABLE tax.currency OWNER TO db_owner;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_currency') THEN
    CREATE TRIGGER set_updated_at_currency BEFORE UPDATE ON tax.currency
      FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END $$;

GRANT SELECT                          ON tax.currency TO app_runtime, tenant_admin, ops_worker, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE  ON tax.currency TO platform_admin;

-- 3. Seed canonical currencies ----------------------------------------------
INSERT INTO tax.currency(code, name, symbol, decimals) VALUES
  ('EUR', 'Euro',                 '€', 2),
  ('USD', 'US Dollar',             '$', 2),
  ('GBP', 'British Pound',         '£', 2),
  ('CHF', 'Swiss Franc',           'Fr', 2),
  ('CAD', 'Canadian Dollar',       '$', 2),
  ('AUD', 'Australian Dollar',     '$', 2),
  ('JPY', 'Japanese Yen',          '¥', 0),
  ('CNY', 'Chinese Yuan',          '¥', 2),
  ('SEK', 'Swedish Krona',         'kr', 2),
  ('NOK', 'Norwegian Krone',       'kr', 2),
  ('DKK', 'Danish Krone',          'kr', 2)
ON CONFLICT (code) DO UPDATE
  SET name      = EXCLUDED.name,
      symbol    = EXCLUDED.symbol,
      decimals  = EXCLUDED.decimals,
      is_active = true;

COMMIT;
