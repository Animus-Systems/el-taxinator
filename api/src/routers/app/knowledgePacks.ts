import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

// Curated tax content the wizard keeps fresh. State machine on `refresh_state`:
//   idle → in_progress → review_pending → idle  (or → failed → idle on retry)
// The wizard worker (later phase) will hold a heartbeat under
// refresh_heartbeat_at so a stuck refresh can be detected and reset.

const REVIEW_STATUSES = ["verified", "pending_review", "stale"] as const;
const REFRESH_STATES = ["idle", "in_progress", "review_pending", "failed"] as const;

const packSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  content: z.string(),
  sourcePrompt: z.string().nullable(),
  lastRefreshedAt: z.string().nullable(),
  refreshIntervalDays: z.number().int(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  reviewStatus: z.enum(REVIEW_STATUSES),
  refreshState: z.enum(REFRESH_STATES),
  refreshMessage: z.string().nullable(),
  refreshStartedAt: z.string().nullable(),
  refreshFinishedAt: z.string().nullable(),
  refreshHeartbeatAt: z.string().nullable(),
  pendingReviewContent: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  slug: string;
  title: string;
  content: string;
  source_prompt: string | null;
  last_refreshed_at: string | null;
  refresh_interval_days: number;
  provider: string | null;
  model: string | null;
  review_status: typeof REVIEW_STATUSES[number];
  refresh_state: typeof REFRESH_STATES[number];
  refresh_message: string | null;
  refresh_started_at: string | null;
  refresh_finished_at: string | null;
  refresh_heartbeat_at: string | null;
  pending_review_content: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id, slug, title, content, source_prompt, last_refreshed_at, refresh_interval_days, "
  + "provider, model, review_status, refresh_state, refresh_message, refresh_started_at, "
  + "refresh_finished_at, refresh_heartbeat_at, pending_review_content, created_at, updated_at";

const toApi = (r: Row) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  content: r.content,
  sourcePrompt: r.source_prompt,
  lastRefreshedAt: r.last_refreshed_at,
  refreshIntervalDays: r.refresh_interval_days,
  provider: r.provider,
  model: r.model,
  reviewStatus: r.review_status,
  refreshState: r.refresh_state,
  refreshMessage: r.refresh_message,
  refreshStartedAt: r.refresh_started_at,
  refreshFinishedAt: r.refresh_finished_at,
  refreshHeartbeatAt: r.refresh_heartbeat_at,
  pendingReviewContent: r.pending_review_content,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const knowledgePacksRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/knowledge-packs", tags: ["knowledge"] } })
    .input(tenantPathInput)
    .output(z.array(packSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(`SELECT ${COLS} FROM tax.knowledge_pack ORDER BY slug`),
      );
      return result.rows.map(toApi);
    }),

  upsert: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/knowledge-packs", tags: ["knowledge"] } })
    .input(tenantPathInput.extend({
      slug: z.string().min(1).max(120),
      title: z.string().min(1).max(200),
      content: z.string(),
      sourcePrompt: z.string().nullish(),
      refreshIntervalDays: z.number().int().min(1).max(365).default(30),
      provider: z.string().nullish(),
      model: z.string().nullish(),
      reviewStatus: z.enum(REVIEW_STATUSES).default("verified"),
    }))
    .output(packSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.knowledge_pack
             (tenant_id, slug, title, content, source_prompt, refresh_interval_days, provider, model, review_status)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, slug) DO UPDATE
             SET title                 = EXCLUDED.title,
                 content               = EXCLUDED.content,
                 source_prompt         = EXCLUDED.source_prompt,
                 refresh_interval_days = EXCLUDED.refresh_interval_days,
                 provider              = EXCLUDED.provider,
                 model                 = EXCLUDED.model,
                 review_status         = EXCLUDED.review_status,
                 updated_at            = now()
           RETURNING ${COLS}`,
          [
            input.slug,
            input.title,
            input.content,
            input.sourcePrompt ?? null,
            input.refreshIntervalDays,
            input.provider ?? null,
            input.model ?? null,
            input.reviewStatus,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  // State-machine helpers used by the refresh worker. Idempotent within a state.
  setRefreshState: tenantProcedure
    .meta({
      openapi: { method: "PATCH", path: "/tenants/{tenantId}/knowledge-packs/{id}/refresh-state", tags: ["knowledge"] },
    })
    .input(tenantPathInput.extend({
      id: z.string().uuid(),
      refreshState: z.enum(REFRESH_STATES),
      refreshMessage: z.string().nullish(),
      pendingReviewContent: z.string().nullish(),
      heartbeat: z.boolean().default(false),
    }))
    .output(packSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.knowledge_pack SET
             refresh_state          = $2,
             refresh_message        = CASE WHEN $3::boolean THEN $4 ELSE refresh_message END,
             pending_review_content = CASE WHEN $5::boolean THEN $6 ELSE pending_review_content END,
             refresh_started_at     = CASE WHEN $2 = 'in_progress'    THEN now() ELSE refresh_started_at END,
             refresh_finished_at    = CASE WHEN $2 IN ('idle','review_pending','failed') THEN now() ELSE refresh_finished_at END,
             refresh_heartbeat_at   = CASE WHEN $7::boolean OR $2 = 'in_progress' THEN now() ELSE refresh_heartbeat_at END,
             last_refreshed_at      = CASE WHEN $2 = 'idle' AND refresh_state = 'in_progress' THEN now() ELSE last_refreshed_at END
           WHERE id = $1
           RETURNING ${COLS}`,
          [
            input.id,
            input.refreshState,
            input.refreshMessage !== undefined,        input.refreshMessage ?? null,
            input.pendingReviewContent !== undefined,  input.pendingReviewContent ?? null,
            input.heartbeat,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/knowledge-packs/{id}", tags: ["knowledge"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.knowledge_pack WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),
});
