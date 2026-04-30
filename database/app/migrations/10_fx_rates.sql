-- App DB: ECB daily FX rates (global, no tenancy).
--
-- Quoted as `eur_per_unit`: how many euros one unit of `currency` is worth.
-- Same as the legacy taxinator schema, picked because the ECB publishes
-- rates against EUR and SLs/autonomos in Spain settle taxes in EUR.
-- Conversion in either direction is then a single multiply.
--
-- No RLS, no tenant_id — the rates are public information shared across
-- the platform. A daily ECB sync worker (Phase 5+) populates this table.

BEGIN;

CREATE TABLE IF NOT EXISTS tax.fx_rate (
  rate_date     date NOT NULL,
  currency      text NOT NULL REFERENCES tax.currency(code),
  eur_per_unit  numeric(20, 10) NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_date, currency),
  CONSTRAINT fx_rate_positive CHECK (eur_per_unit > 0)
);
ALTER TABLE tax.fx_rate OWNER TO db_owner;

CREATE INDEX IF NOT EXISTS fx_rate_currency_date_idx
  ON tax.fx_rate (currency, rate_date DESC);

GRANT SELECT                          ON tax.fx_rate TO app_runtime, tenant_admin, ops_worker, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE  ON tax.fx_rate TO platform_admin;

COMMIT;
