-- Identity DB: admin schema views
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§14.2.8)

BEGIN;

CREATE SCHEMA IF NOT EXISTS admin AUTHORIZATION identity_owner;
ALTER SCHEMA admin OWNER TO identity_owner;

CREATE OR REPLACE VIEW admin.outbox_failed_permanently AS
SELECT
  id, topic, key, status, attempt_count, last_error, next_attempt_at,
  created_at, updated_at, locked_at, locked_by
FROM ops.outbox_event
WHERE status = 'failed' AND attempt_count >= 5;

ALTER VIEW admin.outbox_failed_permanently OWNER TO identity_owner;

CREATE OR REPLACE VIEW admin.lockouts_last_10m AS
SELECT
  email,
  ip,
  COUNT(*) AS lockout_events,
  MAX(at)  AS last_lockout_at
FROM iam.auth_attempt
WHERE outcome = 'failure'
  AND reason = 'LOCKED_OUT'
  AND at >= now() - interval '10 minutes'
GROUP BY email, ip;

ALTER VIEW admin.lockouts_last_10m OWNER TO identity_owner;

CREATE OR REPLACE VIEW admin.security_events_by_user AS
SELECT
  user_id, actor_user_id, event_at, event_type, ip, user_agent, meta
FROM iam.security_event;

ALTER VIEW admin.security_events_by_user OWNER TO identity_owner;

-- Admin views are the supported operator interface.
GRANT USAGE ON SCHEMA admin TO identity_readonly;
GRANT SELECT ON admin.outbox_failed_permanently, admin.lockouts_last_10m, admin.security_events_by_user
TO identity_readonly;

COMMIT;
