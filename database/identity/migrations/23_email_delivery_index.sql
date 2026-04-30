-- Index to support efficient linkage between ops.email_delivery and ops.outbox_event
-- via provider_message_id (used in listTenantEmailHistoryRows join).
CREATE INDEX IF NOT EXISTS idx_email_delivery_provider_message_id
  ON ops.email_delivery (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
