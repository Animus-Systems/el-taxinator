-- Create accountant_invites table
CREATE TABLE "accountant_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{"transactions":true,"invoices":true,"tax":true,"time":false}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountant_invites_pkey" PRIMARY KEY ("id")
);

-- Create accountant_access_logs table
CREATE TABLE "accountant_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invite_id" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountant_access_logs_pkey" PRIMARY KEY ("id")
);

-- Create accountant_comments table
CREATE TABLE "accountant_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invite_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountant_comments_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on token
CREATE UNIQUE INDEX "accountant_invites_token_key" ON "accountant_invites"("token");

-- Indexes
CREATE INDEX "accountant_invites_user_id_idx" ON "accountant_invites"("user_id");
CREATE INDEX "accountant_invites_token_idx" ON "accountant_invites"("token");
CREATE INDEX "accountant_access_logs_invite_id_idx" ON "accountant_access_logs"("invite_id");
CREATE INDEX "accountant_access_logs_invite_id_accessed_at_idx" ON "accountant_access_logs"("invite_id", "accessed_at");
CREATE INDEX "accountant_comments_invite_id_idx" ON "accountant_comments"("invite_id");
CREATE INDEX "accountant_comments_entity_type_entity_id_idx" ON "accountant_comments"("entity_type", "entity_id");

-- Foreign keys
ALTER TABLE "accountant_invites" ADD CONSTRAINT "accountant_invites_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accountant_access_logs" ADD CONSTRAINT "accountant_access_logs_invite_id_fkey"
    FOREIGN KEY ("invite_id") REFERENCES "accountant_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accountant_comments" ADD CONSTRAINT "accountant_comments_invite_id_fkey"
    FOREIGN KEY ("invite_id") REFERENCES "accountant_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
