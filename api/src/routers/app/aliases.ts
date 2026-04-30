import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const aliasSchema = z.object({
  id: z.string().uuid(),
  vendorText: z.string(),
  merchantText: z.string(),
  usageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  vendor_text: string;
  merchant_text: string;
  usage_count: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, vendor_text, merchant_text, usage_count, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  vendorText: row.vendor_text,
  merchantText: row.merchant_text,
  usageCount: Number.parseInt(row.usage_count, 10),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const aliasesRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/receipt-aliases", tags: ["aliases"] } })
    .input(tenantPathInput)
    .output(z.array(aliasSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLUMNS} FROM tax.receipt_vendor_alias ORDER BY usage_count DESC, lower(vendor_text)`),
      );
      return result.rows.map(toApi);
    }),

  upsert: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/receipt-aliases", tags: ["aliases"] } })
    .input(tenantPathInput.extend({
      vendorText: z.string().min(1).max(500),
      merchantText: z.string().min(1).max(500),
    }))
    .output(aliasSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.receipt_vendor_alias (tenant_id, vendor_text, merchant_text)
           VALUES (core.current_tenant_id(), $1, $2)
           ON CONFLICT (tenant_id, lower(vendor_text)) DO UPDATE
             SET merchant_text = EXCLUDED.merchant_text,
                 usage_count   = tax.receipt_vendor_alias.usage_count + 1,
                 updated_at    = now()
           RETURNING ${COLUMNS}`,
          [input.vendorText, input.merchantText],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/receipt-aliases/{id}", tags: ["aliases"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.receipt_vendor_alias WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
