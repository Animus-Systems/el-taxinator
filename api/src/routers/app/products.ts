import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int(),
  currencyCode: z.string(),
  vatRate: z.number(),
  unit: z.string().nullable(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  name: string;
  description: string | null;
  price_cents: string; // bigint comes back as string
  currency_code: string;
  vat_rate: string;    // numeric comes back as string
  unit: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, name, description, price_cents, currency_code, vat_rate, unit, is_archived, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  priceCents: Number.parseInt(row.price_cents, 10),
  currencyCode: row.currency_code,
  vatRate: Number.parseFloat(row.vat_rate),
  unit: row.unit,
  isArchived: row.is_archived,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const productsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/products", tags: ["products"] } })
    .input(tenantPathInput)
    .output(z.array(productSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLUMNS} FROM tax.product ORDER BY is_archived ASC, lower(name) ASC`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/products", tags: ["products"] } })
    .input(
      tenantPathInput.extend({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).nullish(),
        priceCents: z.number().int().nonnegative().default(0),
        currencyCode: z.string().regex(/^[A-Z]{3}$/).default("EUR"),
        vatRate: z.number().min(0).max(100).default(21),
        unit: z.string().max(40).nullish(),
      }),
    )
    .output(productSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.product
             (tenant_id, name, description, price_cents, currency_code, vat_rate, unit)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6)
           RETURNING ${COLUMNS}`,
          [
            input.name,
            input.description ?? null,
            input.priceCents,
            input.currencyCode,
            input.vatRate,
            input.unit ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/products/{id}", tags: ["products"] } })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).nullish(),
        priceCents: z.number().int().nonnegative().optional(),
        currencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
        vatRate: z.number().min(0).max(100).optional(),
        unit: z.string().max(40).nullish(),
        isArchived: z.boolean().optional(),
      }),
    )
    .output(productSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.product SET
             name          = COALESCE($2, name),
             description   = CASE WHEN $3::boolean THEN $4 ELSE description END,
             price_cents   = COALESCE($5, price_cents),
             currency_code = COALESCE($6, currency_code),
             vat_rate      = COALESCE($7, vat_rate),
             unit          = CASE WHEN $8::boolean THEN $9 ELSE unit END,
             is_archived   = COALESCE($10, is_archived)
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name ?? null,
            input.description !== undefined,
            input.description ?? null,
            input.priceCents ?? null,
            input.currencyCode ?? null,
            input.vatRate ?? null,
            input.unit !== undefined,
            input.unit ?? null,
            input.isArchived ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/products/{id}", tags: ["products"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.product WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
