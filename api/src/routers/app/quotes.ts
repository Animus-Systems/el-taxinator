import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;

const itemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number().int(),
  vatRate: z.number(),
  position: z.number().int(),
});

const quoteSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  pdfFileId: z.string().uuid().nullable(),
  number: z.string(),
  status: z.enum(QUOTE_STATUSES),
  issueDate: z.string(),
  expiryDate: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(itemSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type QuoteRow = {
  id: string;
  contact_id: string | null;
  template_id: string | null;
  pdf_file_id: string | null;
  number: string;
  status: typeof QUOTE_STATUSES[number];
  issue_date: string;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: string;
  unit_price_cents: string;
  vat_rate: string;
  position: number;
};

const QUOTE_COLS = "id, contact_id, template_id, pdf_file_id, number, status, issue_date, expiry_date, notes, created_at, updated_at";
const ITEM_COLS = "id, product_id, description, quantity, unit_price_cents, vat_rate, position";

const itemToApi = (row: ItemRow) => ({
  id: row.id,
  productId: row.product_id,
  description: row.description,
  quantity: Number.parseFloat(row.quantity),
  unitPriceCents: Number.parseInt(row.unit_price_cents, 10),
  vatRate: Number.parseFloat(row.vat_rate),
  position: row.position,
});

const quoteToApi = (row: QuoteRow, items: ItemRow[]) => ({
  id: row.id,
  contactId: row.contact_id,
  templateId: row.template_id,
  pdfFileId: row.pdf_file_id,
  number: row.number,
  status: row.status,
  issueDate: row.issue_date,
  expiryDate: row.expiry_date,
  notes: row.notes,
  items: items.map(itemToApi),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

const itemInputSchema = z.object({
  productId: z.string().uuid().nullish(),
  description: z.string().min(1).max(2000),
  quantity: z.number().nonnegative().default(1),
  unitPriceCents: z.number().int(),
  vatRate: z.number().min(0).max(100).default(21),
  position: z.number().int().nonnegative().default(0),
});

import type { PgClient } from "../../db/appDb.js";
const fetchItems = async (client: PgClient, quoteId: string): Promise<ItemRow[]> => {
  const r = await client.query<ItemRow>(
    `SELECT ${ITEM_COLS} FROM tax.quote_item WHERE quote_id = $1 ORDER BY position ASC, id ASC`,
    [quoteId],
  );
  return r.rows;
};

export const quotesRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/quotes", tags: ["quotes"] } })
    .input(tenantPathInput.extend({ status: z.enum(QUOTE_STATUSES).optional(), limit: z.number().int().min(1).max(500).default(100) }))
    .output(z.array(quoteSchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        const headers = input.status
          ? await client.query<QuoteRow>(
              `SELECT ${QUOTE_COLS} FROM tax.quote WHERE status = $1 ORDER BY issue_date DESC LIMIT $2`,
              [input.status, input.limit],
            )
          : await client.query<QuoteRow>(
              `SELECT ${QUOTE_COLS} FROM tax.quote ORDER BY issue_date DESC LIMIT $1`,
              [input.limit],
            );

        if (headers.rows.length === 0) return [];
        const ids = headers.rows.map((r) => r.id);
        const items = await client.query<ItemRow & { quote_id: string }>(
          `SELECT quote_id, ${ITEM_COLS} FROM tax.quote_item WHERE quote_id = ANY($1::uuid[]) ORDER BY position ASC, id ASC`,
          [ids],
        );
        const grouped = new Map<string, ItemRow[]>();
        for (const r of items.rows) {
          const list = grouped.get(r.quote_id) ?? [];
          list.push(r);
          grouped.set(r.quote_id, list);
        }
        return headers.rows.map((q) => quoteToApi(q, grouped.get(q.id) ?? []));
      });
      return rows;
    }),

  get: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/quotes/{id}", tags: ["quotes"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(quoteSchema)
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        const head = await client.query<QuoteRow>(
          `SELECT ${QUOTE_COLS} FROM tax.quote WHERE id = $1`,
          [input.id],
        );
        if (!head.rows[0]) return null;
        const items = await fetchItems(client, input.id);
        return quoteToApi(head.rows[0], items);
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/quotes", tags: ["quotes"] } })
    .input(tenantPathInput.extend({
      contactId: z.string().uuid().nullish(),
      templateId: z.string().uuid().nullish(),
      number: z.string().min(1).max(60),
      status: z.enum(QUOTE_STATUSES).default("draft"),
      issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      notes: z.string().max(5000).nullish(),
      items: z.array(itemInputSchema).default([]),
    }))
    .output(quoteSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        await client.query("BEGIN");
        try {
          const head = await client.query<QuoteRow>(
            `INSERT INTO tax.quote
               (tenant_id, contact_id, template_id, number, status, issue_date, expiry_date, notes)
             VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
             RETURNING ${QUOTE_COLS}`,
            [
              input.contactId ?? null,
              input.templateId ?? null,
              input.number,
              input.status,
              input.issueDate,
              input.expiryDate ?? null,
              input.notes ?? null,
            ],
          );
          const headRow = head.rows[0];
          if (!headRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          for (const [idx, item] of input.items.entries()) {
            await client.query(
              `INSERT INTO tax.quote_item
                 (tenant_id, quote_id, product_id, description, quantity, unit_price_cents, vat_rate, position)
               VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)`,
              [
                headRow.id,
                item.productId ?? null,
                item.description,
                item.quantity,
                item.unitPriceCents,
                item.vatRate,
                item.position ?? idx,
              ],
            );
          }
          const items = await fetchItems(client, headRow.id);
          await client.query("COMMIT");
          return quoteToApi(headRow, items);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });
      return result;
    }),

  // Replace items wholesale on update — common pattern for invoice/quote
  // editing UIs because tracking per-line diffs is messy. Header fields
  // patch normally.
  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/quotes/{id}", tags: ["quotes"] } })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      contactId: z.string().uuid().nullish(),
      templateId: z.string().uuid().nullish(),
      status: z.enum(QUOTE_STATUSES).optional(),
      issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      notes: z.string().max(5000).nullish(),
      items: z.array(itemInputSchema).optional(),
    }))
    .output(quoteSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        await client.query("BEGIN");
        try {
          const head = await client.query<QuoteRow>(
            `UPDATE tax.quote SET
               contact_id   = CASE WHEN $2::boolean THEN $3 ELSE contact_id END,
               template_id  = CASE WHEN $4::boolean THEN $5 ELSE template_id END,
               status       = COALESCE($6, status),
               issue_date   = COALESCE($7, issue_date),
               expiry_date  = CASE WHEN $8::boolean THEN $9 ELSE expiry_date END,
               notes        = CASE WHEN $10::boolean THEN $11 ELSE notes END
             WHERE id = $1
             RETURNING ${QUOTE_COLS}`,
            [
              input.id,
              input.contactId !== undefined,  input.contactId ?? null,
              input.templateId !== undefined, input.templateId ?? null,
              input.status ?? null,
              input.issueDate ?? null,
              input.expiryDate !== undefined, input.expiryDate ?? null,
              input.notes !== undefined,      input.notes ?? null,
            ],
          );
          const headRow = head.rows[0];
          if (!headRow) {
            await client.query("ROLLBACK");
            return null;
          }

          if (input.items !== undefined) {
            await client.query("DELETE FROM tax.quote_item WHERE quote_id = $1", [input.id]);
            for (const [idx, item] of input.items.entries()) {
              await client.query(
                `INSERT INTO tax.quote_item
                   (tenant_id, quote_id, product_id, description, quantity, unit_price_cents, vat_rate, position)
                 VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)`,
                [
                  input.id,
                  item.productId ?? null,
                  item.description,
                  item.quantity,
                  item.unitPriceCents,
                  item.vatRate,
                  item.position ?? idx,
                ],
              );
            }
          }
          const items = await fetchItems(client, input.id);
          await client.query("COMMIT");
          return quoteToApi(headRow, items);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/quotes/{id}", tags: ["quotes"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.quote WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
