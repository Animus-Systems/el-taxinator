import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const projectSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  llmPrompt: z.string().nullable(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  code: string;
  name: string;
  color: string;
  llm_prompt: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, code, name, color, llm_prompt, is_archived, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  color: row.color,
  llmPrompt: row.llm_prompt,
  isArchived: row.is_archived,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const projectsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/projects", tags: ["projects"] } })
    .input(tenantPathInput)
    .output(z.array(projectSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLUMNS} FROM tax.project ORDER BY is_archived ASC, code ASC`),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/projects", tags: ["projects"] } })
    .input(
      tenantPathInput.extend({
        code: z.string().regex(/^[a-z0-9_-]+$/).min(1).max(60),
        name: z.string().min(1).max(200),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
        llmPrompt: z.string().max(2000).nullish(),
      }),
    )
    .output(projectSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.project (tenant_id, code, name, color, llm_prompt)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4)
           RETURNING ${COLUMNS}`,
          [input.code, input.name, input.color, input.llmPrompt ?? null],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/projects/{id}", tags: ["projects"] } })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        llmPrompt: z.string().max(2000).nullish(),
        isArchived: z.boolean().optional(),
      }),
    )
    .output(projectSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.project SET
             name        = COALESCE($2, name),
             color       = COALESCE($3, color),
             llm_prompt  = CASE WHEN $4::boolean THEN $5 ELSE llm_prompt END,
             is_archived = COALESCE($6, is_archived)
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.name ?? null,
            input.color ?? null,
            input.llmPrompt !== undefined,
            input.llmPrompt ?? null,
            input.isArchived ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/projects/{id}", tags: ["projects"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.project WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
