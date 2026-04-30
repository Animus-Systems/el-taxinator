import { z } from "zod";
import { protectedProcedure, router } from "../../trpc.js";

// Global ECB rate lookups. tax.fx_rate has no RLS — rates are public — so
// reads run on the regular pool with no tenant context. Mutations come from
// a future ECB sync worker, not from per-user calls; not exposed here.

const fxSchema = z.object({
  rateDate: z.string(),
  currency: z.string(),
  eurPerUnit: z.number(),
  fetchedAt: z.string(),
});

type Row = { rate_date: string; currency: string; eur_per_unit: string; fetched_at: string };

const toApi = (row: Row) => ({
  rateDate: row.rate_date,
  currency: row.currency,
  eurPerUnit: Number.parseFloat(row.eur_per_unit),
  fetchedAt: row.fetched_at,
});

export const fxRouter = router({
  latest: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/fx/latest", tags: ["fx"] } })
    .input(z.object({ currency: z.string().regex(/^[A-Z]{3}$/) }))
    .output(fxSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.query<Row>(
        "SELECT rate_date, currency, eur_per_unit, fetched_at "
          + "FROM tax.fx_rate WHERE currency = $1 ORDER BY rate_date DESC LIMIT 1",
        [input.currency],
      );
      const row = result.rows[0];
      return row ? toApi(row) : null;
    }),

  on: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/fx/on/{rateDate}/{currency}", tags: ["fx"] } })
    .input(z.object({
      rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      currency: z.string().regex(/^[A-Z]{3}$/),
    }))
    .output(fxSchema.nullable())
    .query(async ({ ctx, input }) => {
      // Look up the most recent rate on or before the requested date — banks
      // close on weekends, so an invoice issued on Saturday picks up Friday's
      // rate.
      const result = await ctx.appDb.query<Row>(
        "SELECT rate_date, currency, eur_per_unit, fetched_at "
          + "FROM tax.fx_rate WHERE currency = $1 AND rate_date <= $2 "
          + "ORDER BY rate_date DESC LIMIT 1",
        [input.currency, input.rateDate],
      );
      const row = result.rows[0];
      return row ? toApi(row) : null;
    }),
});
