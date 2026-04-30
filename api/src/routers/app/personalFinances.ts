import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

// Personal IRPF inputs: income sources + one-off deductions. Both are
// straightforward CRUD; the interesting wiring is the FK from
// personal_deduction.file_id back to tax.file (composite, same-tenant).

const INCOME_KINDS = [
  "salary", "self_employment", "dividends", "interest",
  "rental", "royalty", "pension", "other",
] as const;

const incomeSourceSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(INCOME_KINDS),
  name: z.string(),
  taxId: z.string().nullable(),
  metadata: z.unknown(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type IncomeRow = {
  id: string;
  kind: typeof INCOME_KINDS[number];
  name: string;
  tax_id: string | null;
  metadata: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const INCOME_COLS = "id, kind, name, tax_id, metadata, is_active, created_at, updated_at";

const incomeToApi = (r: IncomeRow) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  taxId: r.tax_id,
  metadata: r.metadata,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const deductionSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  taxYear: z.number().int(),
  amountCents: z.number().int(),
  description: z.string().nullable(),
  fileId: z.string().uuid().nullable(),
  metadata: z.unknown(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type DeductionRow = {
  id: string;
  kind: string;
  tax_year: number;
  amount_cents: string;
  description: string | null;
  file_id: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

const DEDUCTION_COLS = "id, kind, tax_year, amount_cents, description, file_id, metadata, created_at, updated_at";

const deductionToApi = (r: DeductionRow) => ({
  id: r.id,
  kind: r.kind,
  taxYear: r.tax_year,
  amountCents: Number.parseInt(r.amount_cents, 10),
  description: r.description,
  fileId: r.file_id,
  metadata: r.metadata,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const personalFinancesRouter = router({
  // Income sources
  listIncomeSources: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/income-sources", tags: ["personal"] } })
    .input(tenantPathInput.extend({ kind: z.enum(INCOME_KINDS).optional() }))
    .output(z.array(incomeSourceSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.kind
          ? client.query<IncomeRow>(
              `SELECT ${INCOME_COLS} FROM tax.income_source WHERE kind = $1 ORDER BY is_active DESC, name`,
              [input.kind],
            )
          : client.query<IncomeRow>(
              `SELECT ${INCOME_COLS} FROM tax.income_source ORDER BY is_active DESC, name`,
            ),
      );
      return result.rows.map(incomeToApi);
    }),

  createIncomeSource: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/income-sources", tags: ["personal"] } })
    .input(tenantPathInput.extend({
      kind: z.enum(INCOME_KINDS),
      name: z.string().min(1).max(200),
      taxId: z.string().max(80).nullish(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .output(incomeSourceSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<IncomeRow>(
          `INSERT INTO tax.income_source (tenant_id, kind, name, tax_id, metadata)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4::jsonb)
           RETURNING ${INCOME_COLS}`,
          [input.kind, input.name, input.taxId ?? null, JSON.stringify(input.metadata ?? {})],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return incomeToApi(row);
    }),

  updateIncomeSource: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/income-sources/{id}", tags: ["personal"] } })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      taxId: z.string().max(80).nullish(),
      metadata: z.record(z.unknown()).nullish(),
      isActive: z.boolean().optional(),
    }))
    .output(incomeSourceSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<IncomeRow>(
          `UPDATE tax.income_source SET
             name      = COALESCE($2, name),
             tax_id    = CASE WHEN $3::boolean THEN $4 ELSE tax_id END,
             metadata  = CASE WHEN $5::boolean THEN $6::jsonb ELSE metadata END,
             is_active = COALESCE($7, is_active)
           WHERE id = $1
           RETURNING ${INCOME_COLS}`,
          [
            input.id,
            input.name ?? null,
            input.taxId !== undefined,    input.taxId ?? null,
            input.metadata !== undefined, input.metadata !== undefined ? JSON.stringify(input.metadata) : null,
            input.isActive ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return incomeToApi(row);
    }),

  deleteIncomeSource: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/income-sources/{id}", tags: ["personal"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.income_source WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  // Personal deductions
  listDeductions: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/deductions", tags: ["personal"] } })
    .input(tenantPathInput.extend({ taxYear: z.number().int().optional() }))
    .output(z.array(deductionSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.taxYear
          ? client.query<DeductionRow>(
              `SELECT ${DEDUCTION_COLS} FROM tax.personal_deduction WHERE tax_year = $1 ORDER BY tax_year DESC, kind`,
              [input.taxYear],
            )
          : client.query<DeductionRow>(
              `SELECT ${DEDUCTION_COLS} FROM tax.personal_deduction ORDER BY tax_year DESC, kind`,
            ),
      );
      return result.rows.map(deductionToApi);
    }),

  createDeduction: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/deductions", tags: ["personal"] } })
    .input(tenantPathInput.extend({
      kind: z.string().min(1).max(80),
      taxYear: z.number().int().min(1990).max(2100),
      amountCents: z.number().int().positive(),
      description: z.string().max(2000).nullish(),
      fileId: z.string().uuid().nullish(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .output(deductionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<DeductionRow>(
          `INSERT INTO tax.personal_deduction
             (tenant_id, kind, tax_year, amount_cents, description, file_id, metadata)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6::jsonb)
           RETURNING ${DEDUCTION_COLS}`,
          [
            input.kind,
            input.taxYear,
            input.amountCents,
            input.description ?? null,
            input.fileId ?? null,
            JSON.stringify(input.metadata ?? {}),
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return deductionToApi(row);
    }),

  deleteDeduction: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/deductions/{id}", tags: ["personal"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.personal_deduction WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
