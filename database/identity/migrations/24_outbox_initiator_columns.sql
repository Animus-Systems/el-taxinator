-- Migration 24: Outbox initiator columns
--
-- Adds typed initiator columns to ops.outbox_event so the email worker can
-- resolve sender identity from the initiating actor (and their reseller, when
-- applicable) without JSONB path extraction. Part of the reseller-first hub
-- refactor: each reseller user-initiated email should be sent from that
-- reseller's email/SMTP config when configured.
--
-- All columns are nullable. Existing in-flight rows continue to work because
-- the dispatch resolver falls through to the platform default profile when
-- initiator columns are NULL. No backfill required.

BEGIN;

ALTER TABLE ops.outbox_event
  ADD COLUMN IF NOT EXISTS initiated_by_user_id     uuid,
  ADD COLUMN IF NOT EXISTS initiated_by_reseller_id uuid,
  ADD COLUMN IF NOT EXISTS initiator_tenant_id      uuid,
  ADD COLUMN IF NOT EXISTS initiator_project_id     uuid;

COMMENT ON COLUMN ops.outbox_event.initiated_by_user_id IS
  'iam.user_account.id of the human/service that enqueued this event. Used by the dispatch resolver as a fallback when initiated_by_reseller_id is not pre-populated.';
COMMENT ON COLUMN ops.outbox_event.initiated_by_reseller_id IS
  'excursions.reseller.id (in the app DB) when the initiator acted as a reseller user. NULL for platform-initiated events; tells the dispatch resolver to use reseller email/SMTP config.';
COMMENT ON COLUMN ops.outbox_event.initiator_tenant_id IS
  'core.tenant.id (in the app DB) for the initiator scope. Needed to re-check reseller membership and to scope cross-DB lookups.';
COMMENT ON COLUMN ops.outbox_event.initiator_project_id IS
  'core.project.id (in the app DB) for the initiator scope.';

CREATE INDEX IF NOT EXISTS idx_outbox_event_initiator_reseller
  ON ops.outbox_event(initiated_by_reseller_id)
  WHERE initiated_by_reseller_id IS NOT NULL;

COMMIT;
