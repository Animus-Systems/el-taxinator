import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const factSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source: z.string(),
  learnedFromSessionId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  key: string;
  value: unknown;
  source: string;
  learned_from_session_id: string | null;
  created_at: string;
  updated_at: string;
};

const COLS = "key, value, source, learned_from_session_id, created_at, updated_at";

const toApi = (r: Row) => ({
  key: r.key,
  value: r.value,
  source: r.source,
  learnedFromSessionId: r.learned_from_session_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const businessFactsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/business-facts", tags: ["business-facts"] } })
    .input(tenantPathInput)
    .output(z.array(factSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLS} FROM tax.business_fact ORDER BY key`),
      );
      return result.rows.map(toApi);
    }),

  // Upsert by key: lets the wizard overwrite a previously-learned fact when
  // the user corrects it. `source` defaults to 'wizard' but can be 'manual'
  // when the user types it themselves.
  upsert: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/business-facts", tags: ["business-facts"] } })
    .input(tenantPathInput.extend({
      key: z.string().min(1).max(120),
      value: z.unknown(),
      source: z.enum(["wizard", "manual", "import"]).default("manual"),
      learnedFromSessionId: z.string().uuid().nullish(),
    }))
    .output(factSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.business_fact (tenant_id, key, value, source, learned_from_session_id)
           VALUES (core.current_tenant_id(), $1, $2::jsonb, $3, $4)
           ON CONFLICT (tenant_id, key) DO UPDATE
             SET value = EXCLUDED.value,
                 source = EXCLUDED.source,
                 learned_from_session_id = EXCLUDED.learned_from_session_id,
                 updated_at = now()
           RETURNING ${COLS}`,
          [
            input.key,
            JSON.stringify(input.value ?? null),
            input.source,
            input.learnedFromSessionId ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/business-facts/{key}", tags: ["business-facts"] } })
    .input(tenantPathInput.extend({ key: z.string().min(1).max(120) }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.business_fact WHERE key = $1 RETURNING key", [input.key]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
