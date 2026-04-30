import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

// Crypto lot inventory + FIFO disposal matching.
//
// `matchDisposal` is the only non-CRUD bit: it takes a disposal transaction
// id, an asset, a quantity to dispose, and the total proceeds in cents,
// then walks the open lots for that asset in FIFO order, consuming quantity
// and freezing cost basis + realised gain per match. Everything happens in
// a single transaction so a partial match never leaves crypto_lot.qty_remaining
// out of sync with crypto_disposal_match.

const lotSchema = z.object({
  id: z.string().uuid(),
  asset: z.string(),
  assetClass: z.string(),
  acquiredAt: z.string(),
  quantityTotal: z.number(),
  quantityRemaining: z.number(),
  costPerUnitCents: z.number().int(),
  feesCents: z.number().int(),
  sourceTransactionId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const matchSchema = z.object({
  id: z.string().uuid(),
  disposalTransactionId: z.string().uuid(),
  lotId: z.string().uuid(),
  asset: z.string(),
  assetClass: z.string(),
  quantityConsumed: z.number(),
  costBasisCents: z.number().int(),
  proceedsCents: z.number().int(),
  realizedGainCents: z.number().int(),
  matchedAt: z.string(),
});

type LotRow = {
  id: string;
  asset: string;
  asset_class: string;
  acquired_at: string;
  quantity_total: string;
  quantity_remaining: string;
  cost_per_unit_cents: string;
  fees_cents: string;
  source_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

type MatchRow = {
  id: string;
  disposal_transaction_id: string;
  lot_id: string;
  asset: string;
  asset_class: string;
  quantity_consumed: string;
  cost_basis_cents: string;
  proceeds_cents: string;
  realized_gain_cents: string;
  matched_at: string;
};

const LOT_COLS =
  "id, asset, asset_class, acquired_at, quantity_total, quantity_remaining, "
  + "cost_per_unit_cents, fees_cents, source_transaction_id, created_at, updated_at";
const MATCH_COLS =
  "id, disposal_transaction_id, lot_id, asset, asset_class, quantity_consumed, "
  + "cost_basis_cents, proceeds_cents, realized_gain_cents, matched_at";

const lotToApi = (r: LotRow) => ({
  id: r.id,
  asset: r.asset,
  assetClass: r.asset_class,
  acquiredAt: r.acquired_at,
  quantityTotal: Number.parseFloat(r.quantity_total),
  quantityRemaining: Number.parseFloat(r.quantity_remaining),
  costPerUnitCents: Number.parseInt(r.cost_per_unit_cents, 10),
  feesCents: Number.parseInt(r.fees_cents, 10),
  sourceTransactionId: r.source_transaction_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const matchToApi = (r: MatchRow) => ({
  id: r.id,
  disposalTransactionId: r.disposal_transaction_id,
  lotId: r.lot_id,
  asset: r.asset,
  assetClass: r.asset_class,
  quantityConsumed: Number.parseFloat(r.quantity_consumed),
  costBasisCents: Number.parseInt(r.cost_basis_cents, 10),
  proceedsCents: Number.parseInt(r.proceeds_cents, 10),
  realizedGainCents: Number.parseInt(r.realized_gain_cents, 10),
  matchedAt: r.matched_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const cryptoRouter = router({
  listLots: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/crypto/lots", tags: ["crypto"] } })
    .input(tenantPathInput.extend({ asset: z.string().optional(), openOnly: z.boolean().default(false) }))
    .output(z.array(lotSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (input.asset)   { params.push(input.asset);  conditions.push(`asset = $${params.length}`); }
        if (input.openOnly) conditions.push("quantity_remaining > 0");
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        return client.query<LotRow>(
          `SELECT ${LOT_COLS} FROM tax.crypto_lot ${where} ORDER BY asset, acquired_at ASC`,
          params,
        );
      });
      return result.rows.map(lotToApi);
    }),

  createLot: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/crypto/lots", tags: ["crypto"] } })
    .input(tenantPathInput.extend({
      asset: z.string().min(1).max(40),
      assetClass: z.string().max(40).default("crypto"),
      acquiredAt: z.string().datetime(),
      quantity: z.number().positive(),
      costPerUnitCents: z.number().int().nonnegative(),
      feesCents: z.number().int().nonnegative().default(0),
      sourceTransactionId: z.string().uuid().nullish(),
    }))
    .output(lotSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<LotRow>(
          `INSERT INTO tax.crypto_lot
             (tenant_id, asset, asset_class, acquired_at, quantity_total, quantity_remaining,
              cost_per_unit_cents, fees_cents, source_transaction_id)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $4, $5, $6, $7)
           RETURNING ${LOT_COLS}`,
          [
            input.asset,
            input.assetClass,
            input.acquiredAt,
            input.quantity,
            input.costPerUnitCents,
            input.feesCents,
            input.sourceTransactionId ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return lotToApi(row);
    }),

  listMatches: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/crypto/matches", tags: ["crypto"] } })
    .input(tenantPathInput.extend({
      year: z.number().int().min(1990).max(2100).optional(),
      asset: z.string().optional(),
    }))
    .output(z.array(matchSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (input.year) {
          params.push(`${input.year}-01-01`);
          conditions.push(`matched_at >= $${params.length}`);
          params.push(`${input.year + 1}-01-01`);
          conditions.push(`matched_at < $${params.length}`);
        }
        if (input.asset) { params.push(input.asset); conditions.push(`asset = $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        return client.query<MatchRow>(
          `SELECT ${MATCH_COLS} FROM tax.crypto_disposal_match ${where} ORDER BY matched_at DESC`,
          params,
        );
      });
      return result.rows.map(matchToApi);
    }),

  matchDisposal: tenantProcedure
    .meta({
      openapi: { method: "POST", path: "/tenants/{tenantId}/crypto/match", tags: ["crypto"] },
    })
    .input(tenantPathInput.extend({
      disposalTransactionId: z.string().uuid(),
      asset: z.string().min(1).max(40),
      assetClass: z.string().max(40).default("crypto"),
      quantity: z.number().positive(),
      proceedsCents: z.number().int().nonnegative(),
    }))
    .output(z.object({ matches: z.array(matchSchema), totalCostBasisCents: z.number().int(), totalRealizedGainCents: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        await client.query("BEGIN");
        try {
          // Lock the open lots for this asset in FIFO order. SELECT ... FOR
          // UPDATE prevents two concurrent disposals from double-consuming.
          const lots = await client.query<LotRow>(
            `SELECT ${LOT_COLS} FROM tax.crypto_lot
              WHERE asset = $1 AND quantity_remaining > 0
              ORDER BY acquired_at ASC, id ASC
              FOR UPDATE`,
            [input.asset],
          );

          let remainingToConsume = input.quantity;
          let totalCostBasis = 0;
          const matches: MatchRow[] = [];

          for (const lot of lots.rows) {
            if (remainingToConsume <= 0) break;
            const lotRemaining = Number.parseFloat(lot.quantity_remaining);
            if (lotRemaining <= 0) continue;

            const consume = Math.min(remainingToConsume, lotRemaining);
            // Cost basis cents: round to nearest cent. Use bankers' rounding
            // via Math.round on the cents quantity; lot cost_per_unit is
            // already cents so consume * cost gives cents.
            const costBasisCents = Math.round(consume * Number.parseInt(lot.cost_per_unit_cents, 10));
            // Proportional proceeds: this lot's share of the disposal.
            const proceedsCents = Math.round((consume / input.quantity) * input.proceedsCents);
            const realizedGainCents = proceedsCents - costBasisCents;

            const newRemaining = lotRemaining - consume;
            await client.query(
              "UPDATE tax.crypto_lot SET quantity_remaining = $2 WHERE id = $1",
              [lot.id, newRemaining.toString()],
            );

            const inserted = await client.query<MatchRow>(
              `INSERT INTO tax.crypto_disposal_match
                 (tenant_id, disposal_transaction_id, lot_id, asset, asset_class,
                  quantity_consumed, cost_basis_cents, proceeds_cents, realized_gain_cents)
               VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING ${MATCH_COLS}`,
              [
                input.disposalTransactionId,
                lot.id,
                input.asset,
                input.assetClass,
                consume,
                costBasisCents,
                proceedsCents,
                realizedGainCents,
              ],
            );
            const matchRow = inserted.rows[0];
            if (matchRow) matches.push(matchRow);
            totalCostBasis += costBasisCents;
            remainingToConsume -= consume;
          }

          if (remainingToConsume > 1e-12) {
            // Not enough open lots to cover the disposal. Roll back so the
            // caller can fix the books (record an earlier acquisition first).
            await client.query("ROLLBACK");
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient open lots for ${input.asset}: short by ${remainingToConsume}.`,
            });
          }

          await client.query("COMMIT");
          const totalGain = matches.reduce((sum, m) => sum + Number.parseInt(m.realized_gain_cents, 10), 0);
          return {
            matches: matches.map(matchToApi),
            totalCostBasisCents: totalCostBasis,
            totalRealizedGainCents: totalGain,
          };
        } catch (err) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw err;
        }
      });
    }),
});
