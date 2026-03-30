-- Add deductible flag to transactions
ALTER TABLE "transactions" ADD COLUMN "deductible" BOOLEAN;

-- Create time_entries table
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "description" TEXT,
    "project_code" TEXT,
    "client_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "hourly_rate" INTEGER,
    "currency_code" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT true,
    "is_invoiced" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_code_user_id_fkey"
    FOREIGN KEY ("project_code", "user_id") REFERENCES "projects"("code", "user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "time_entries_user_id_idx" ON "time_entries"("user_id");
CREATE INDEX "time_entries_user_id_project_code_idx" ON "time_entries"("user_id", "project_code");
CREATE INDEX "time_entries_user_id_client_id_idx" ON "time_entries"("user_id", "client_id");
CREATE INDEX "time_entries_user_id_started_at_idx" ON "time_entries"("user_id", "started_at");
