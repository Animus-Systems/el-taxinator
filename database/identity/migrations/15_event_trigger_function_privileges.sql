-- Identity DB: event-trigger safety net to prevent PUBLIC EXECUTE on new functions
--
-- Postgres defaults grant EXECUTE on newly-created functions to PUBLIC.
-- This event trigger revokes EXECUTE from PUBLIC for any new functions/procedures
-- created in Identity schemas.

BEGIN;

CREATE OR REPLACE FUNCTION ops.revoke_public_execute_on_new_routines()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.schema_name IN ('iam','oidc','ops','admin') THEN
      IF cmd.object_type = 'function' THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', cmd.object_identity);
      ELSIF cmd.object_type = 'procedure' THEN
        EXECUTE format('REVOKE EXECUTE ON PROCEDURE %s FROM PUBLIC', cmd.object_identity);
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION ops.revoke_public_execute_on_new_routines() FROM PUBLIC;

DROP EVENT TRIGGER IF EXISTS trg_revoke_public_execute_on_new_routines;
DO $$
BEGIN
  -- Event triggers require superuser on vanilla Postgres and are commonly restricted on managed providers.
  BEGIN
    EXECUTE 'CREATE EVENT TRIGGER trg_revoke_public_execute_on_new_routines '
            'ON ddl_command_end '
            'WHEN TAG IN (''CREATE FUNCTION'', ''CREATE PROCEDURE'') '
            'EXECUTE FUNCTION ops.revoke_public_execute_on_new_routines()';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping event trigger trg_revoke_public_execute_on_new_routines (insufficient_privilege)';
  END;
END $$;

COMMIT;
