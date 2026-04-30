import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const ACCOUNT_TYPES = ["bank", "credit_card", "crypto_exchange", "crypto_wallet", "cash"] as const;

const accountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  bankName: z.string().nullable(),
  currencyCode: z.string(),
  accountNumber: z.string().nullable(),
  accountType: z.enum(ACCOUNT_TYPES),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  name: string;
  bank_name: string | null;
  currency_code: string;
  account_number: string | null;
  account_type: typeof ACCOUNT_TYPES[number];
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, name, bank_name, currency_code, account_number, account_type, is_active, notes, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  name: row.name,
  bankName: row.bank_name,
  currencyCode: row.currency_code,
  accountNumber: row.account_number,
  accountType: row.account_type,
  isActive: row.is_active,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const accountsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/accounts", tags: ["accounts"] } })
    .input(tenantPathInput)
    .output(z.array(accountSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLUMNS} FROM tax.account ORDER BY is_active DESC, name ASC`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/accounts", tags: ["accounts"] } })
    .input(
      tenantPathInput.extend({
        name: z.string().min(1).max(200),
        bankName: z.string().max(200).nullish(),
        currencyCode: z.string().regex(/^[A-Z]{3}$/).default("EUR"),
        accountNumber: z.string().max(64).nullish(),
        accountType: z.enum(ACCOUNT_TYPES).default("bank"),
        notes: z.string().max(2000).nullish(),
      }),
    )
    .output(accountSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.account
             (tenant_id, name, bank_name, currency_code, account_number, account_type, notes)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6)
           RETURNING ${COLUMNS}`,
          [
            input.name,
            input.bankName ?? null,
            input.currencyCode,
            input.accountNumber ?? null,
            input.accountType,
            input.notes ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/accounts/{id}", tags: ["accounts"] } })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        bankName: z.string().max(200).nullish(),
        accountNumber: z.string().max(64).nullish(),
        accountType: z.enum(ACCOUNT_TYPES).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().max(2000).nullish(),
      }),
    )
    .output(accountSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.account SET
             name           = COALESCE($2, name),
             bank_name      = CASE WHEN $3::boolean THEN $4 ELSE bank_name END,
             account_number = CASE WHEN $5::boolean THEN $6 ELSE account_number END,
             account_type   = COALESCE($7, account_type),
             is_active      = COALESCE($8, is_active),
             notes          = CASE WHEN $9::boolean THEN $10 ELSE notes END
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name ?? null,
            input.bankName !== undefined,
            input.bankName ?? null,
            input.accountNumber !== undefined,
            input.accountNumber ?? null,
            input.accountType ?? null,
            input.isActive ?? null,
            input.notes !== undefined,
            input.notes ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/accounts/{id}", tags: ["accounts"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.account WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
