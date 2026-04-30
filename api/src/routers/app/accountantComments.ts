import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

// Comments accountants attach to entities. Any tenant member can read; only
// the author can update/delete (enforced by the row-level `author_write`
// policy on tax.accountant_comment). All three mutations carry
// accountantWritable=true so accountant-role members can use them.

const ENTITY_TYPES = [
  "transaction", "invoice", "purchase", "quote",
  "tax_filing", "contact", "file", "knowledge_pack",
] as const;

const commentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  user_id: string;
  entity_type: typeof ENTITY_TYPES[number];
  entity_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

const COLS = "id, user_id, entity_type, entity_id, body, created_at, updated_at";

const toApi = (r: Row) => ({
  id: r.id,
  userId: r.user_id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const accountantCommentsRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/comments", tags: ["comments"] } })
    .input(tenantPathInput.extend({
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: z.string().optional(),
    }))
    .output(z.array(commentSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (input.entityType) { params.push(input.entityType); conditions.push(`entity_type = $${params.length}`); }
        if (input.entityId)   { params.push(input.entityId);   conditions.push(`entity_id   = $${params.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        return client.query<Row>(
          `SELECT ${COLS} FROM tax.accountant_comment ${where} ORDER BY created_at DESC LIMIT 500`,
          params,
        );
      });
      return result.rows.map(toApi);
    }),

  post: tenantProcedure
    .meta({
      openapi: { method: "POST", path: "/tenants/{tenantId}/comments", tags: ["comments"] },
      accountantWritable: true,
    })
    .input(tenantPathInput.extend({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string().min(1).max(120),
      body: z.string().min(1).max(8000),
    }))
    .output(commentSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.accountant_comment (tenant_id, user_id, entity_type, entity_id, body)
           VALUES (core.current_tenant_id(), core.current_user_id(), $1, $2, $3)
           RETURNING ${COLS}`,
          [input.entityType, input.entityId, input.body],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({
      openapi: { method: "PATCH", path: "/tenants/{tenantId}/comments/{id}", tags: ["comments"] },
      accountantWritable: true,
    })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      body: z.string().min(1).max(8000),
    }))
    .output(commentSchema)
    .mutation(async ({ ctx, input }) => {
      // RLS author_write policy means the UPDATE only matches a row when
      // user_id = core.current_user_id(). A non-author edit returns 0 rows
      // and we surface NOT_FOUND (rather than FORBIDDEN to avoid leaking
      // existence).
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.accountant_comment SET body = $2 WHERE id = $1 RETURNING ${COLS}`,
          [input.id, input.body],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({
      openapi: { method: "DELETE", path: "/tenants/{tenantId}/comments/{id}", tags: ["comments"] },
      accountantWritable: true,
    })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.accountant_comment WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
