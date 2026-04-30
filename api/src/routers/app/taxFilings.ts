import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const filingSchema = z.object({
  id: z.string().uuid(),
  year: z.number().int(),
  quarter: z.number().int().nullable(),
  modeloCode: z.string(),
  filedAt: z.string().nullable(),
  checklist: z.unknown(),
  notes: z.string().nullable(),
  filedAmountCents: z.number().int().nullable(),
  confirmationNumber: z.string().nullable(),
  filingSource: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  year: number;
  quarter: number | null;
  modelo_code: string;
  filed_at: string | null;
  checklist: unknown;
  notes: string | null;
  filed_amount_cents: string | null;
  confirmation_number: string | null;
  filing_source: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id, year, quarter, modelo_code, filed_at, checklist, notes, "
  + "filed_amount_cents, confirmation_number, filing_source, created_at, updated_at";

const toApi = (r: Row) => ({
  id: r.id,
  year: r.year,
  quarter: r.quarter,
  modeloCode: r.modelo_code,
  filedAt: r.filed_at,
  checklist: r.checklist,
  notes: r.notes,
  filedAmountCents: r.filed_amount_cents === null ? null : Number.parseInt(r.filed_amount_cents, 10),
  confirmationNumber: r.confirmation_number,
  filingSource: r.filing_source,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const taxFilingsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/tax-filings", tags: ["tax-filings"] } })
    .input(tenantPathInput.extend({
      year: z.number().int().min(1990).max(2100).optional(),
    }))
    .output(z.array(filingSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.year
          ? client.query<Row>(
              `SELECT ${COLS} FROM tax.tax_filing WHERE year = $1 ORDER BY year DESC, quarter NULLS FIRST, modelo_code`,
              [input.year],
            )
          : client.query<Row>(
              `SELECT ${COLS} FROM tax.tax_filing ORDER BY year DESC, quarter NULLS FIRST, modelo_code`,
            ),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/tax-filings", tags: ["tax-filings"] } })
    .input(tenantPathInput.extend({
      year: z.number().int().min(1990).max(2100),
      quarter: z.number().int().min(1).max(4).nullish(),
      modeloCode: z.string().min(1).max(40),
      checklist: z.record(z.unknown()).optional(),
      notes: z.string().max(5000).nullish(),
    }))
    .output(filingSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.tax_filing (tenant_id, year, quarter, modelo_code, checklist, notes)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4::jsonb, $5)
           RETURNING ${COLS}`,
          [
            input.year,
            input.quarter ?? null,
            input.modeloCode,
            JSON.stringify(input.checklist ?? {}),
            input.notes ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/tax-filings/{id}", tags: ["tax-filings"] } })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      checklist: z.record(z.unknown()).nullish(),
      notes: z.string().max(5000).nullish(),
    }))
    .output(filingSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.tax_filing SET
             checklist = CASE WHEN $2::boolean THEN $3::jsonb ELSE checklist END,
             notes     = CASE WHEN $4::boolean THEN $5 ELSE notes END
           WHERE id = $1
           RETURNING ${COLS}`,
          [
            input.id,
            input.checklist !== undefined, input.checklist !== undefined ? JSON.stringify(input.checklist) : null,
            input.notes !== undefined,     input.notes ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  // Mark a filing filed: stamp filed_at + amount + confirmation. The checklist
  // can be empty or already-completed; we don't enforce checklist closure
  // here because Hacienda accepts late or partial filings and the wizard
  // wants to record reality, not ideals.
  // Accountants file on behalf of the owner — opt them in for this mutation
  // even though they're read-only on the rest of tax-filings CRUD.
  markFiled: tenantProcedure
    .meta({
      openapi: { method: "POST", path: "/tenants/{tenantId}/tax-filings/{id}/file", tags: ["tax-filings"] },
      accountantWritable: true,
    })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      filedAmountCents: z.number().int().nullish(),
      confirmationNumber: z.string().max(120).nullish(),
      filingSource: z.string().max(120).nullish(),
      filedAt: z.string().datetime().optional(),
    }))
    .output(filingSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.tax_filing SET
             filed_at            = COALESCE($2::timestamptz, now()),
             filed_amount_cents  = COALESCE($3, filed_amount_cents),
             confirmation_number = COALESCE($4, confirmation_number),
             filing_source       = COALESCE($5, filing_source)
           WHERE id = $1
           RETURNING ${COLS}`,
          [
            input.id,
            input.filedAt ?? null,
            input.filedAmountCents ?? null,
            input.confirmationNumber ?? null,
            input.filingSource ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/tax-filings/{id}", tags: ["tax-filings"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.tax_filing WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
