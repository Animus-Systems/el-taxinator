-- Identity DB: add explicit impersonation audit event types

BEGIN;

ALTER TABLE iam.security_event
  DROP CONSTRAINT IF EXISTS security_event_event_type_check;

ALTER TABLE iam.security_event
  ADD CONSTRAINT security_event_event_type_check CHECK (
    event_type IN (
      'AUTH_LOCKOUT',
      'AUTH_FAILURE_SPIKE',
      'REFRESH_TOKEN_REUSE',
      'SESSION_REVOKED',
      'GRANT_REVOKED',
      'PASSWORD_CHANGED',
      'EMAIL_CHANGED',
      'EMAIL_VERIFIED',
      'IDENTITY_LINKED',
      'IDENTITY_UNLINKED',
      'MISSING_IDENTIFIERS',
      'RLS_POLICY_MISCONFIG',
      'SYSTEM_ERROR',
      'IMPERSONATION_STARTED',
      'IMPERSONATION_STOPPED'
    )
  );

COMMIT;
