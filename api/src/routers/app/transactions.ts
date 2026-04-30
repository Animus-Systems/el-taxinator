import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const TYPES = ["expense", "income", "transfer"] as const;
const STATUSES = ["business", "personal", "mixed"] as const;
const TRANSFER_DIRECTIONS = ["outgoing", "incoming"] as const;

const transactionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  merchant: z.string().nullable(),
  note: z.string().nullable(),
  text: z.string().nullable(),
  totalCents: z.number().nullable(),
  currencyCode: z.string().nullable(),
  convertedTotalCents: z.number().nullable(),
  convertedCurrencyCode: z.string().nullable(),
  realizedFxGainCents: z.number().nullable(),
  type: z.enum(TYPES),
  status: z.enum(STATUSES),
  deductible: z.boolean().nullable(),
  accountId: z.string().uuid().nullable(),
  counterAccountId: z.string().uuid().nullable(),
  categoryCode: z.string().nullable(),
  projectCode: z.string().nullable(),
  appliedRuleId: z.string().uuid().nullable(),
  transferId: z.string().uuid().nullable(),
  transferDirection: z.enum(TRANSFER_DIRECTIONS).nullable(),
  fileIds: z.array(z.string().uuid()),
  items: z.array(z.unknown()),
  extra: z.unknown().nullable(),
  issuedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  name: string | null;
  description: string | null;
  merchant: string | null;
  note: string | null;
  text: string | null;
  total_cents: string | null;
  currency_code: string | null;
  converted_total_cents: string | null;
  converted_currency_code: string | null;
  realized_fx_gain_cents: string | null;
  type: typeof TYPES[number];
  status: typeof STATUSES[number];
  deductible: boolean | null;
  account_id: string | null;
  counter_account_id: string | null;
  category_code: string | null;
  project_code: string | null;
  applied_rule_id: string | null;
  transfer_id: string | null;
  transfer_direction: typeof TRANSFER_DIRECTIONS[number] | null;
  file_ids: string[];
  items: unknown[];
  extra: unknown | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, name, description, merchant, note, text, total_cents, currency_code, "
  + "converted_total_cents, converted_currency_code, realized_fx_gain_cents, "
  + "type, status, deductible, account_id, counter_account_id, "
  + "category_code, project_code, applied_rule_id, transfer_id, transfer_direction, "
  + "file_ids, items, extra, issued_at, created_at, updated_at";

const toCents = (s: string | null): number | null =>
  s === null ? null : Number.parseInt(s, 10);

const toApi = (row: Row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  merchant: row.merchant,
  note: row.note,
  text: row.text,
  totalCents: toCents(row.total_cents),
  currencyCode: row.currency_code,
  convertedTotalCents: toCents(row.converted_total_cents),
  convertedCurrencyCode: row.converted_currency_code,
  realizedFxGainCents: toCents(row.realized_fx_gain_cents),
  type: row.type,
  status: row.status,
  deductible: row.deductible,
  accountId: row.account_id,
  counterAccountId: row.counter_account_id,
  categoryCode: row.category_code,
  projectCode: row.project_code,
  appliedRuleId: row.applied_rule_id,
  transferId: row.transfer_id,
  transferDirection: row.transfer_direction,
  fileIds: row.file_ids,
  items: Array.isArray(row.items) ? row.items : [],
  extra: row.extra,
  issuedAt: row.issued_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

const createInput = tenantPathInput.extend({
  name: z.string().max(500).nullish(),
  description: z.string().max(2000).nullish(),
  merchant: z.string().max(500).nullish(),
  note: z.string().max(2000).nullish(),
  totalCents: z.number().int().nullish(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/).nullish(),
  convertedTotalCents: z.number().int().nullish(),
  convertedCurrencyCode: z.string().regex(/^[A-Z]{3}$/).nullish(),
  realizedFxGainCents: z.number().int().nullish(),
  type: z.enum(TYPES).default("expense"),
  status: z.enum(STATUSES).default("business"),
  deductible: z.boolean().nullish(),
  accountId: z.string().uuid().nullish(),
  counterAccountId: z.string().uuid().nullish(),
  categoryCode: z.string().nullish(),
  projectCode: z.string().nullish(),
  transferId: z.string().uuid().nullish(),
  transferDirection: z.enum(TRANSFER_DIRECTIONS).nullish(),
  fileIds: z.array(z.string().uuid()).default([]),
  items: z.array(z.record(z.unknown())).default([]),
  extra: z.record(z.unknown()).nullish(),
  issuedAt: z.string().datetime().nullish(),
});

export const transactionsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/transactions", tags: ["transactions"] } })
    .input(
      tenantPathInput.extend({
        type: z.enum(TYPES).optional(),
        accountId: z.string().uuid().optional(),
        categoryCode: z.string().optional(),
        projectCode: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .output(z.array(transactionSchema))
    .query(async ({ ctx, input }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      const push = (clause: string, value: unknown) => {
        params.push(value);
        conditions.push(clause.replace("?", `$${params.length}`));
      };
      if (input.type)         push("type           = ?", input.type);
      if (input.accountId)    push("account_id     = ?", input.accountId);
      if (input.categoryCode) push("category_code  = ?", input.categoryCode);
      if (input.projectCode)  push("project_code   = ?", input.projectCode);
      if (input.from)         push("issued_at     >= ?", input.from);
      if (input.to)           push("issued_at     <= ?", input.to);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(input.limit);
      const limitParam = `$${params.length}`;

      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `SELECT ${COLUMNS} FROM tax.transaction ${where}
           ORDER BY issued_at DESC NULLS LAST, created_at DESC
           LIMIT ${limitParam}`,
          params,
        ),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/transactions", tags: ["transactions"] } })
    .input(createInput)
    .output(transactionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.transaction
             (tenant_id, name, description, merchant, note, total_cents, currency_code,
              converted_total_cents, converted_currency_code, realized_fx_gain_cents,
              type, status, deductible, account_id, counter_account_id,
              category_code, project_code, transfer_id, transfer_direction,
              file_ids, items, extra, issued_at)
           VALUES (core.current_tenant_id(),
              $1,  $2,  $3,  $4,  $5,  $6,
              $7,  $8,  $9,
              $10, $11, $12, $13, $14,
              $15, $16, $17, $18,
              $19, $20::jsonb, $21::jsonb, $22)
           RETURNING ${COLUMNS}`,
          [
            input.name ?? null,
            input.description ?? null,
            input.merchant ?? null,
            input.note ?? null,
            input.totalCents ?? null,
            input.currencyCode ?? null,
            input.convertedTotalCents ?? null,
            input.convertedCurrencyCode ?? null,
            input.realizedFxGainCents ?? null,
            input.type,
            input.status,
            input.deductible ?? null,
            input.accountId ?? null,
            input.counterAccountId ?? null,
            input.categoryCode ?? null,
            input.projectCode ?? null,
            input.transferId ?? null,
            input.transferDirection ?? null,
            input.fileIds,
            JSON.stringify(input.items),
            input.extra ? JSON.stringify(input.extra) : null,
            input.issuedAt ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({
      openapi: { method: "PATCH", path: "/tenants/{tenantId}/transactions/{id}", tags: ["transactions"] },
    })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        name: z.string().max(500).nullish(),
        description: z.string().max(2000).nullish(),
        merchant: z.string().max(500).nullish(),
        note: z.string().max(2000).nullish(),
        totalCents: z.number().int().nullish(),
        currencyCode: z.string().regex(/^[A-Z]{3}$/).nullish(),
        type: z.enum(TYPES).optional(),
        status: z.enum(STATUSES).optional(),
        deductible: z.boolean().nullish(),
        accountId: z.string().uuid().nullish(),
        categoryCode: z.string().nullish(),
        projectCode: z.string().nullish(),
        issuedAt: z.string().datetime().nullish(),
      }),
    )
    .output(transactionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.transaction SET
             name           = CASE WHEN $2::boolean  THEN $3  ELSE name END,
             description    = CASE WHEN $4::boolean  THEN $5  ELSE description END,
             merchant       = CASE WHEN $6::boolean  THEN $7  ELSE merchant END,
             note           = CASE WHEN $8::boolean  THEN $9  ELSE note END,
             total_cents    = CASE WHEN $10::boolean THEN $11 ELSE total_cents END,
             currency_code  = CASE WHEN $12::boolean THEN $13 ELSE currency_code END,
             type           = COALESCE($14, type),
             status         = COALESCE($15, status),
             deductible     = CASE WHEN $16::boolean THEN $17 ELSE deductible END,
             account_id     = CASE WHEN $18::boolean THEN $19 ELSE account_id END,
             category_code  = CASE WHEN $20::boolean THEN $21 ELSE category_code END,
             project_code   = CASE WHEN $22::boolean THEN $23 ELSE project_code END,
             issued_at      = CASE WHEN $24::boolean THEN $25 ELSE issued_at END
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name !== undefined,         input.name ?? null,
            input.description !== undefined,  input.description ?? null,
            input.merchant !== undefined,     input.merchant ?? null,
            input.note !== undefined,         input.note ?? null,
            input.totalCents !== undefined,   input.totalCents ?? null,
            input.currencyCode !== undefined, input.currencyCode ?? null,
            input.type ?? null,
            input.status ?? null,
            input.deductible !== undefined,   input.deductible ?? null,
            input.accountId !== undefined,    input.accountId ?? null,
            input.categoryCode !== undefined, input.categoryCode ?? null,
            input.projectCode !== undefined,  input.projectCode ?? null,
            input.issuedAt !== undefined,     input.issuedAt ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/transactions/{id}", tags: ["transactions"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.transaction WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
