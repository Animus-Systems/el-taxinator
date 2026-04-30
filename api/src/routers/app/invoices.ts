import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";
import type { PgClient } from "../../db/appDb.js";

const STATUSES = ["draft", "issued", "paid", "cancelled", "void"] as const;
const KINDS = ["invoice", "simplified"] as const;

const itemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number().int(),
  vatRate: z.number(),
  position: z.number().int(),
});

const paymentSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  amountCents: z.number().int(),
  note: z.string().nullable(),
  source: z.string(),
  createdAt: z.string(),
});

const invoiceSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  quoteId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  pdfFileId: z.string().uuid().nullable(),
  number: z.string(),
  status: z.enum(STATUSES),
  kind: z.enum(KINDS),
  issueDate: z.string(),
  dueDate: z.string().nullable(),
  paidAt: z.string().nullable(),
  notes: z.string().nullable(),
  currencyCode: z.string(),
  totalCents: z.number().int().nullable(),
  irpfRate: z.number(),
  fxRateToEur: z.number().nullable(),
  fxRateDate: z.string().nullable(),
  fxRateSource: z.string().nullable(),
  items: z.array(itemSchema),
  payments: z.array(paymentSchema),
  paidCents: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type HeadRow = {
  id: string;
  contact_id: string | null;
  quote_id: string | null;
  template_id: string | null;
  pdf_file_id: string | null;
  number: string;
  status: typeof STATUSES[number];
  kind: typeof KINDS[number];
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  currency_code: string;
  total_cents: string | null;
  irpf_rate: string;
  fx_rate_to_eur: string | null;
  fx_rate_date: string | null;
  fx_rate_source: string | null;
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

type PaymentRow = {
  id: string;
  transaction_id: string;
  amount_cents: string;
  note: string | null;
  source: string;
  created_at: string;
};

const HEAD_COLS =
  "id, contact_id, quote_id, template_id, pdf_file_id, number, status, kind, "
  + "issue_date, due_date, paid_at, notes, currency_code, total_cents, irpf_rate, "
  + "fx_rate_to_eur, fx_rate_date, fx_rate_source, created_at, updated_at";

const ITEM_COLS = "id, product_id, description, quantity, unit_price_cents, vat_rate, position";
const PAY_COLS  = "id, transaction_id, amount_cents, note, source, created_at";

const numOrNull = (s: string | null): number | null => (s === null ? null : Number.parseFloat(s));
const intOrNull = (s: string | null): number | null => (s === null ? null : Number.parseInt(s, 10));

const itemToApi = (r: ItemRow) => ({
  id: r.id,
  productId: r.product_id,
  description: r.description,
  quantity: Number.parseFloat(r.quantity),
  unitPriceCents: Number.parseInt(r.unit_price_cents, 10),
  vatRate: Number.parseFloat(r.vat_rate),
  position: r.position,
});

const payToApi = (r: PaymentRow) => ({
  id: r.id,
  transactionId: r.transaction_id,
  amountCents: Number.parseInt(r.amount_cents, 10),
  note: r.note,
  source: r.source,
  createdAt: r.created_at,
});

const headToApi = (h: HeadRow, items: ItemRow[], payments: PaymentRow[]) => ({
  id: h.id,
  contactId: h.contact_id,
  quoteId: h.quote_id,
  templateId: h.template_id,
  pdfFileId: h.pdf_file_id,
  number: h.number,
  status: h.status,
  kind: h.kind,
  issueDate: h.issue_date,
  dueDate: h.due_date,
  paidAt: h.paid_at,
  notes: h.notes,
  currencyCode: h.currency_code,
  totalCents: intOrNull(h.total_cents),
  irpfRate: Number.parseFloat(h.irpf_rate),
  fxRateToEur: numOrNull(h.fx_rate_to_eur),
  fxRateDate: h.fx_rate_date,
  fxRateSource: h.fx_rate_source,
  items: items.map(itemToApi),
  payments: payments.map(payToApi),
  paidCents: payments.reduce((sum, p) => sum + Number.parseInt(p.amount_cents, 10), 0),
  createdAt: h.created_at,
  updatedAt: h.updated_at,
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

const fetchItems = async (client: PgClient, invoiceId: string): Promise<ItemRow[]> => {
  const r = await client.query<ItemRow>(
    `SELECT ${ITEM_COLS} FROM tax.invoice_item WHERE invoice_id = $1 ORDER BY position ASC, id ASC`,
    [invoiceId],
  );
  return r.rows;
};

const fetchPayments = async (client: PgClient, invoiceId: string): Promise<PaymentRow[]> => {
  const r = await client.query<PaymentRow>(
    `SELECT ${PAY_COLS} FROM tax.invoice_payment WHERE invoice_id = $1 ORDER BY created_at ASC`,
    [invoiceId],
  );
  return r.rows;
};

export const invoicesRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/invoices", tags: ["invoices"] } })
    .input(tenantPathInput.extend({
      status: z.enum(STATUSES).optional(),
      kind: z.enum(KINDS).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .output(z.array(invoiceSchema))
    .query(async ({ ctx, input }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      const push = (clause: string, value: unknown) => {
        params.push(value);
        conditions.push(clause.replace("?", `$${params.length}`));
      };
      if (input.status) push("status = ?", input.status);
      if (input.kind)   push("kind   = ?", input.kind);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(input.limit);
      const limitParam = `$${params.length}`;

      return ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        const heads = await client.query<HeadRow>(
          `SELECT ${HEAD_COLS} FROM tax.invoice ${where} ORDER BY issue_date DESC LIMIT ${limitParam}`,
          params,
        );
        if (heads.rows.length === 0) return [];
        const ids = heads.rows.map((r) => r.id);
        const [items, payments] = await Promise.all([
          client.query<ItemRow & { invoice_id: string }>(
            `SELECT invoice_id, ${ITEM_COLS} FROM tax.invoice_item WHERE invoice_id = ANY($1::uuid[])`,
            [ids],
          ),
          client.query<PaymentRow & { invoice_id: string }>(
            `SELECT invoice_id, ${PAY_COLS} FROM tax.invoice_payment WHERE invoice_id = ANY($1::uuid[])`,
            [ids],
          ),
        ]);
        const itemsByInv = new Map<string, ItemRow[]>();
        for (const r of items.rows) {
          const list = itemsByInv.get(r.invoice_id) ?? [];
          list.push(r);
          itemsByInv.set(r.invoice_id, list);
        }
        const paysByInv = new Map<string, PaymentRow[]>();
        for (const r of payments.rows) {
          const list = paysByInv.get(r.invoice_id) ?? [];
          list.push(r);
          paysByInv.set(r.invoice_id, list);
        }
        return heads.rows.map((h) => headToApi(h, itemsByInv.get(h.id) ?? [], paysByInv.get(h.id) ?? []));
      });
    }),

  get: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/invoices/{id}", tags: ["invoices"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(invoiceSchema)
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        const head = await client.query<HeadRow>(
          `SELECT ${HEAD_COLS} FROM tax.invoice WHERE id = $1`,
          [input.id],
        );
        if (!head.rows[0]) return null;
        const [items, payments] = await Promise.all([
          fetchItems(client, input.id),
          fetchPayments(client, input.id),
        ]);
        return headToApi(head.rows[0], items, payments);
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/invoices", tags: ["invoices"] } })
    .input(tenantPathInput.extend({
      contactId: z.string().uuid().nullish(),
      quoteId: z.string().uuid().nullish(),
      templateId: z.string().uuid().nullish(),
      number: z.string().min(1).max(60),
      status: z.enum(STATUSES).default("draft"),
      kind: z.enum(KINDS).default("invoice"),
      issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      currencyCode: z.string().regex(/^[A-Z]{3}$/).default("EUR"),
      totalCents: z.number().int().nullish(),
      irpfRate: z.number().min(0).max(100).default(0),
      fxRateToEur: z.number().positive().nullish(),
      fxRateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      fxRateSource: z.string().nullish(),
      notes: z.string().max(5000).nullish(),
      items: z.array(itemInputSchema).default([]),
    }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        await client.query("BEGIN");
        try {
          const head = await client.query<HeadRow>(
            `INSERT INTO tax.invoice
               (tenant_id, contact_id, quote_id, template_id, number, status, kind,
                issue_date, due_date, currency_code, total_cents, irpf_rate,
                fx_rate_to_eur, fx_rate_date, fx_rate_source, notes)
             VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING ${HEAD_COLS}`,
            [
              input.contactId ?? null,
              input.quoteId ?? null,
              input.templateId ?? null,
              input.number,
              input.status,
              input.kind,
              input.issueDate,
              input.dueDate ?? null,
              input.currencyCode,
              input.totalCents ?? null,
              input.irpfRate,
              input.fxRateToEur ?? null,
              input.fxRateDate ?? null,
              input.fxRateSource ?? null,
              input.notes ?? null,
            ],
          );
          const headRow = head.rows[0];
          if (!headRow) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          for (const [idx, item] of input.items.entries()) {
            await client.query(
              `INSERT INTO tax.invoice_item
                 (tenant_id, invoice_id, product_id, description, quantity, unit_price_cents, vat_rate, position)
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
          return headToApi(headRow, items, []);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });
      return result;
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/invoices/{id}", tags: ["invoices"] } })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      status: z.enum(STATUSES).optional(),
      issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      paidAt: z.string().datetime().nullish(),
      totalCents: z.number().int().nullish(),
      notes: z.string().max(5000).nullish(),
      items: z.array(itemInputSchema).optional(),
    }))
    .output(invoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        await client.query("BEGIN");
        try {
          const head = await client.query<HeadRow>(
            `UPDATE tax.invoice SET
               status      = COALESCE($2, status),
               issue_date  = COALESCE($3, issue_date),
               due_date    = CASE WHEN $4::boolean THEN $5 ELSE due_date END,
               paid_at     = CASE WHEN $6::boolean THEN $7 ELSE paid_at END,
               total_cents = CASE WHEN $8::boolean THEN $9 ELSE total_cents END,
               notes       = CASE WHEN $10::boolean THEN $11 ELSE notes END
             WHERE id = $1
             RETURNING ${HEAD_COLS}`,
            [
              input.id,
              input.status ?? null,
              input.issueDate ?? null,
              input.dueDate !== undefined,    input.dueDate ?? null,
              input.paidAt !== undefined,     input.paidAt ?? null,
              input.totalCents !== undefined, input.totalCents ?? null,
              input.notes !== undefined,      input.notes ?? null,
            ],
          );
          const headRow = head.rows[0];
          if (!headRow) {
            await client.query("ROLLBACK");
            return null;
          }
          if (input.items !== undefined) {
            await client.query("DELETE FROM tax.invoice_item WHERE invoice_id = $1", [input.id]);
            for (const [idx, item] of input.items.entries()) {
              await client.query(
                `INSERT INTO tax.invoice_item
                   (tenant_id, invoice_id, product_id, description, quantity, unit_price_cents, vat_rate, position)
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
          const [items, payments] = await Promise.all([
            fetchItems(client, input.id),
            fetchPayments(client, input.id),
          ]);
          await client.query("COMMIT");
          return headToApi(headRow, items, payments);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/invoices/{id}", tags: ["invoices"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.invoice WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  // Allocate a transaction to an invoice. Repeated allocations on the same
  // (invoice, transaction) pair fail (UNIQUE) — to "increase" an allocation
  // delete and re-create.
  allocatePayment: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/invoices/{invoiceId}/payments", tags: ["invoices"] } })
    .input(tenantPathInput.extend({
      invoiceId: z.string().uuid(),
      transactionId: z.string().uuid(),
      amountCents: z.number().int(),
      note: z.string().max(2000).nullish(),
      source: z.enum(["manual", "rule", "import"]).default("manual"),
    }))
    .output(paymentSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<PaymentRow>(
          `INSERT INTO tax.invoice_payment
             (tenant_id, invoice_id, transaction_id, amount_cents, note, source)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5)
           RETURNING ${PAY_COLS}`,
          [input.invoiceId, input.transactionId, input.amountCents, input.note ?? null, input.source],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return payToApi(row);
    }),

  removePayment: tenantProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/tenants/{tenantId}/invoices/{invoiceId}/payments/{paymentId}",
        tags: ["invoices"],
      },
    })
    .input(tenantPathInput.extend({
      invoiceId: z.string().uuid(),
      paymentId: z.string().uuid(),
    }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query(
          "DELETE FROM tax.invoice_payment WHERE id = $1 AND invoice_id = $2 RETURNING id",
          [input.paymentId, input.invoiceId],
        ),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
