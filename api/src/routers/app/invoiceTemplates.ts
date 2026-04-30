import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const LOGO_POSITIONS = ["left", "right", "center"] as const;
const FONT_PRESETS = ["helvetica", "times", "courier"] as const;
const LANGUAGES = ["es", "en"] as const;

const templateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isDefault: z.boolean(),
  logoFileId: z.string().uuid().nullable(),
  logoPosition: z.enum(LOGO_POSITIONS),
  accentColor: z.string(),
  fontPreset: z.enum(FONT_PRESETS),
  headerText: z.string().nullable(),
  footerText: z.string().nullable(),
  bankDetailsText: z.string().nullable(),
  businessDetailsText: z.string().nullable(),
  belowTotalsText: z.string().nullable(),
  showProminentTotal: z.boolean(),
  showVatColumn: z.boolean(),
  showBankDetails: z.boolean(),
  paymentTermsDays: z.number().int().nullable(),
  language: z.enum(LANGUAGES),
  labels: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  name: string;
  is_default: boolean;
  logo_file_id: string | null;
  logo_position: typeof LOGO_POSITIONS[number];
  accent_color: string;
  font_preset: typeof FONT_PRESETS[number];
  header_text: string | null;
  footer_text: string | null;
  bank_details_text: string | null;
  business_details_text: string | null;
  below_totals_text: string | null;
  show_prominent_total: boolean;
  show_vat_column: boolean;
  show_bank_details: boolean;
  payment_terms_days: number | null;
  language: typeof LANGUAGES[number];
  labels: unknown | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, name, is_default, logo_file_id, logo_position, accent_color, font_preset, "
  + "header_text, footer_text, bank_details_text, business_details_text, below_totals_text, "
  + "show_prominent_total, show_vat_column, show_bank_details, payment_terms_days, language, labels, "
  + "created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  name: row.name,
  isDefault: row.is_default,
  logoFileId: row.logo_file_id,
  logoPosition: row.logo_position,
  accentColor: row.accent_color,
  fontPreset: row.font_preset,
  headerText: row.header_text,
  footerText: row.footer_text,
  bankDetailsText: row.bank_details_text,
  businessDetailsText: row.business_details_text,
  belowTotalsText: row.below_totals_text,
  showProminentTotal: row.show_prominent_total,
  showVatColumn: row.show_vat_column,
  showBankDetails: row.show_bank_details,
  paymentTermsDays: row.payment_terms_days,
  language: row.language,
  labels: row.labels,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const invoiceTemplatesRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/invoice-templates", tags: ["invoice-templates"] } })
    .input(tenantPathInput)
    .output(z.array(templateSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLUMNS} FROM tax.invoice_template ORDER BY is_default DESC, created_at DESC`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/invoice-templates", tags: ["invoice-templates"] } })
    .input(tenantPathInput.extend({
      name: z.string().min(1).max(200),
      logoFileId: z.string().uuid().nullish(),
      logoPosition: z.enum(LOGO_POSITIONS).default("left"),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4f46e5"),
      fontPreset: z.enum(FONT_PRESETS).default("helvetica"),
      headerText: z.string().nullish(),
      footerText: z.string().nullish(),
      bankDetailsText: z.string().nullish(),
      businessDetailsText: z.string().nullish(),
      belowTotalsText: z.string().nullish(),
      showProminentTotal: z.boolean().default(false),
      showVatColumn: z.boolean().default(true),
      showBankDetails: z.boolean().default(false),
      paymentTermsDays: z.number().int().nonnegative().nullish(),
      language: z.enum(LANGUAGES).default("es"),
      labels: z.record(z.unknown()).nullish(),
    }))
    .output(templateSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.invoice_template
             (tenant_id, name, logo_file_id, logo_position, accent_color, font_preset,
              header_text, footer_text, bank_details_text, business_details_text, below_totals_text,
              show_prominent_total, show_vat_column, show_bank_details, payment_terms_days, language, labels)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
           RETURNING ${COLUMNS}`,
          [
            input.name,
            input.logoFileId ?? null,
            input.logoPosition,
            input.accentColor,
            input.fontPreset,
            input.headerText ?? null,
            input.footerText ?? null,
            input.bankDetailsText ?? null,
            input.businessDetailsText ?? null,
            input.belowTotalsText ?? null,
            input.showProminentTotal,
            input.showVatColumn,
            input.showBankDetails,
            input.paymentTermsDays ?? null,
            input.language,
            input.labels ? JSON.stringify(input.labels) : null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/invoice-templates/{id}", tags: ["invoice-templates"] } })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      logoFileId: z.string().uuid().nullish(),
      logoPosition: z.enum(LOGO_POSITIONS).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      fontPreset: z.enum(FONT_PRESETS).optional(),
      headerText: z.string().nullish(),
      footerText: z.string().nullish(),
      bankDetailsText: z.string().nullish(),
      businessDetailsText: z.string().nullish(),
      belowTotalsText: z.string().nullish(),
      showProminentTotal: z.boolean().optional(),
      showVatColumn: z.boolean().optional(),
      showBankDetails: z.boolean().optional(),
      paymentTermsDays: z.number().int().nonnegative().nullish(),
      language: z.enum(LANGUAGES).optional(),
      labels: z.record(z.unknown()).nullish(),
    }))
    .output(templateSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.invoice_template SET
             name                  = COALESCE($2, name),
             logo_file_id          = CASE WHEN $3::boolean  THEN $4  ELSE logo_file_id END,
             logo_position         = COALESCE($5, logo_position),
             accent_color          = COALESCE($6, accent_color),
             font_preset           = COALESCE($7, font_preset),
             header_text           = CASE WHEN $8::boolean  THEN $9  ELSE header_text END,
             footer_text           = CASE WHEN $10::boolean THEN $11 ELSE footer_text END,
             bank_details_text     = CASE WHEN $12::boolean THEN $13 ELSE bank_details_text END,
             business_details_text = CASE WHEN $14::boolean THEN $15 ELSE business_details_text END,
             below_totals_text     = CASE WHEN $16::boolean THEN $17 ELSE below_totals_text END,
             show_prominent_total  = COALESCE($18, show_prominent_total),
             show_vat_column       = COALESCE($19, show_vat_column),
             show_bank_details     = COALESCE($20, show_bank_details),
             payment_terms_days    = CASE WHEN $21::boolean THEN $22 ELSE payment_terms_days END,
             language              = COALESCE($23, language),
             labels                = CASE WHEN $24::boolean THEN $25::jsonb ELSE labels END
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name ?? null,
            input.logoFileId !== undefined,        input.logoFileId ?? null,
            input.logoPosition ?? null,
            input.accentColor ?? null,
            input.fontPreset ?? null,
            input.headerText !== undefined,        input.headerText ?? null,
            input.footerText !== undefined,        input.footerText ?? null,
            input.bankDetailsText !== undefined,   input.bankDetailsText ?? null,
            input.businessDetailsText !== undefined, input.businessDetailsText ?? null,
            input.belowTotalsText !== undefined,   input.belowTotalsText ?? null,
            input.showProminentTotal ?? null,
            input.showVatColumn ?? null,
            input.showBankDetails ?? null,
            input.paymentTermsDays !== undefined,  input.paymentTermsDays ?? null,
            input.language ?? null,
            input.labels !== undefined,            input.labels ? JSON.stringify(input.labels) : null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  // Set this template as the tenant's default. Wrapped in a single tx so we
  // never leave the tenant with two default templates (the partial UNIQUE
  // index would block the second UPDATE; we explicitly clear all defaults
  // first to make the swap atomic).
  setDefault: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/invoice-templates/{id}/default", tags: ["invoice-templates"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(templateSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        await client.query("UPDATE tax.invoice_template SET is_default = false WHERE is_default = true");
        return client.query<Row>(
          `UPDATE tax.invoice_template SET is_default = true WHERE id = $1 RETURNING ${COLUMNS}`,
          [input.id],
        );
      });
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/invoice-templates/{id}", tags: ["invoice-templates"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.invoice_template WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
