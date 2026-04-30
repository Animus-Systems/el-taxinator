import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

// Per-user chat history within a tenant. RLS is two-key (tenant + user) so
// an accountant member of the tenant doesn't read the owner's
// conversations. The system summary (role='system') is unique per
// (tenant, user) and gets upserted by the chat handler as the conversation
// rolls past its context window.

const ROLES = ["user", "assistant", "system", "tool"] as const;
const STATUSES = ["sent", "applied", "failed", "draft"] as const;

const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(ROLES),
  content: z.string(),
  metadata: z.unknown().nullable(),
  status: z.enum(STATUSES),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
});

type Row = {
  id: string;
  role: typeof ROLES[number];
  content: string;
  metadata: unknown | null;
  status: typeof STATUSES[number];
  applied_at: string | null;
  created_at: string;
};

const COLS = "id, role, content, metadata, status, applied_at, created_at";

const toApi = (r: Row) => ({
  id: r.id,
  role: r.role,
  content: r.content,
  metadata: r.metadata,
  status: r.status,
  appliedAt: r.applied_at,
  createdAt: r.created_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const chatRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/chat", tags: ["chat"] } })
    .input(tenantPathInput.extend({
      limit: z.number().int().min(1).max(500).default(100),
      excludeSystem: z.boolean().default(false),
    }))
    .output(z.array(messageSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.excludeSystem
          ? client.query<Row>(
              `SELECT ${COLS} FROM tax.chat_message WHERE role <> 'system'
               ORDER BY created_at DESC LIMIT $1`,
              [input.limit],
            )
          : client.query<Row>(
              `SELECT ${COLS} FROM tax.chat_message ORDER BY created_at DESC LIMIT $1`,
              [input.limit],
            ),
      );
      return result.rows.map(toApi);
    }),

  post: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/chat", tags: ["chat"] } })
    .input(tenantPathInput.extend({
      role: z.enum(ROLES),
      content: z.string().min(1),
      metadata: z.record(z.unknown()).nullish(),
      status: z.enum(STATUSES).default("sent"),
    }))
    .output(messageSchema)
    .mutation(async ({ ctx, input }) => {
      // role='system' is special: at most one per (tenant, user). Upsert it
      // so the rolling summary keeps replacing itself in place.
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        input.role === "system"
          ? client.query<Row>(
              `INSERT INTO tax.chat_message (tenant_id, user_id, role, content, metadata, status)
               VALUES (core.current_tenant_id(), core.current_user_id(), 'system', $1, $2::jsonb, $3)
               ON CONFLICT (tenant_id, user_id) WHERE role = 'system'
                 DO UPDATE SET content = EXCLUDED.content, metadata = EXCLUDED.metadata, status = EXCLUDED.status
               RETURNING ${COLS}`,
              [input.content, input.metadata ? JSON.stringify(input.metadata) : null, input.status],
            )
          : client.query<Row>(
              `INSERT INTO tax.chat_message (tenant_id, user_id, role, content, metadata, status)
               VALUES (core.current_tenant_id(), core.current_user_id(), $1, $2, $3::jsonb, $4)
               RETURNING ${COLS}`,
              [input.role, input.content, input.metadata ? JSON.stringify(input.metadata) : null, input.status],
            ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/chat/{id}", tags: ["chat"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.chat_message WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  // Wipe everything for the current user in this tenant — useful for "start
  // fresh" or GDPR-style local deletion. Doesn't touch other users' chats.
  clear: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/chat", tags: ["chat"] } })
    .input(tenantPathInput)
    .output(z.object({ deletedCount: z.number().int() }))
    .mutation(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.chat_message WHERE 1=1"),
      );
      return { deletedCount: result.rowCount ?? 0 };
    }),
});
