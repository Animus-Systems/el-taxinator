-- Add IRPF withholding rate to invoices
ALTER TABLE "invoices" ADD COLUMN "irpf_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- Add business tax ID (NIF/CIF) to users
ALTER TABLE "users" ADD COLUMN "business_tax_id" TEXT;
