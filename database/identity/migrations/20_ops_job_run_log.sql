-- Identity DB: ops job run log for Cronicle maintenance telemetry

BEGIN;

CREATE TABLE IF NOT EXISTS ops.job_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE ops.job_run_log OWNER TO identity_owner;

CREATE INDEX IF NOT EXISTS idx_identity_job_run_log_job_started
  ON ops.job_run_log(job_name, started_at DESC);

ALTER TABLE ops.job_run_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  force_rls boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='identity_breakglass' AND rolbypassrls
  ) INTO force_rls;
  IF force_rls THEN
    EXECUTE 'ALTER TABLE ops.job_run_log FORCE ROW LEVEL SECURITY';
  END IF;
END $$;

DROP POLICY IF EXISTS identity_app_all ON ops.job_run_log;
CREATE POLICY identity_app_all
  ON ops.job_run_log
  FOR ALL
  TO identity_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_migrator_all ON ops.job_run_log;
CREATE POLICY identity_migrator_all
  ON ops.job_run_log
  FOR ALL
  TO identity_migrator
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS identity_owner_all ON ops.job_run_log;
CREATE POLICY identity_owner_all
  ON ops.job_run_log
  FOR ALL
  TO identity_owner
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.job_run_log TO identity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.job_run_log TO identity_migrator, identity_breakglass;

COMMIT;
