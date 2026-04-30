import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const KINDS = ["income", "expense", "crypto_disposal"] as const;

const categorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(KINDS),
  color: z.string(),
  llmPrompt: z.string().nullable(),
  taxFormRef: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  code: string;
  name: string;
  kind: typeof KINDS[number];
  color: string;
  llm_prompt: string | null;
  tax_form_ref: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, code, name, kind, color, llm_prompt, tax_form_ref, is_default, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  kind: row.kind,
  color: row.color,
  llmPrompt: row.llm_prompt,
  taxFormRef: row.tax_form_ref,
  isDefault: row.is_default,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const categoriesRouter = router({
  list: tenantProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/tenants/{tenantId}/categories",
        tags: ["categories"],
      },
    })
    .input(tenantPathInput)
    .output(z.array(categorySchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLUMNS} FROM tax.category ORDER BY kind, code`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/tenants/{tenantId}/categories",
        tags: ["categories"],
      },
    })
    .input(
      tenantPathInput.extend({
        code: z.string().regex(/^[a-z0-9_-]+$/).min(1).max(60),
        name: z.string().min(1).max(200),
        kind: z.enum(KINDS).default("expense"),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
        llmPrompt: z.string().max(2000).nullish(),
        taxFormRef: z.string().max(200).nullish(),
        isDefault: z.boolean().default(false),
      }),
    )
    .output(categorySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.category (tenant_id, code, name, kind, color, llm_prompt, tax_form_ref, is_default)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7)
           RETURNING ${COLUMNS}`,
          [input.code, input.name, input.kind, input.color, input.llmPrompt ?? null, input.taxFormRef ?? null, input.isDefault],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/tenants/{tenantId}/categories/{id}",
        tags: ["categories"],
      },
    })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        kind: z.enum(KINDS).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        llmPrompt: z.string().max(2000).nullish(),
        taxFormRef: z.string().max(200).nullish(),
        isDefault: z.boolean().optional(),
      }),
    )
    .output(categorySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.category SET
             name           = COALESCE($2, name),
             kind           = COALESCE($3, kind),
             color          = COALESCE($4, color),
             llm_prompt     = CASE WHEN $5::boolean THEN $6 ELSE llm_prompt END,
             tax_form_ref   = CASE WHEN $7::boolean THEN $8 ELSE tax_form_ref END,
             is_default     = COALESCE($9, is_default)
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name ?? null,
            input.kind ?? null,
            input.color ?? null,
            input.llmPrompt !== undefined,
            input.llmPrompt ?? null,
            input.taxFormRef !== undefined,
            input.taxFormRef ?? null,
            input.isDefault ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/tenants/{tenantId}/categories/{id}",
        tags: ["categories"],
      },
    })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>("DELETE FROM tax.category WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
