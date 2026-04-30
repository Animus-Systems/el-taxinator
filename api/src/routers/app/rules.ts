import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantProcedure } from "../../trpc.js";

const MATCH_TYPES = ["contains", "regex", "exact"] as const;
const MATCH_FIELDS = ["merchant", "description", "name", "text"] as const;

const ruleSchema = z.object({
  id: z.string().uuid(),
  matchType: z.enum(MATCH_TYPES),
  matchField: z.enum(MATCH_FIELDS),
  matchValue: z.string(),
  categoryCode: z.string().nullable(),
  projectCode: z.string().nullable(),
  isActive: z.boolean(),
  matchCount: z.number(),
  lastAppliedAt: z.string().nullable(),
  learnReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Row = {
  id: string;
  match_type: typeof MATCH_TYPES[number];
  match_field: typeof MATCH_FIELDS[number];
  match_value: string;
  category_code: string | null;
  project_code: string | null;
  is_active: boolean;
  match_count: string;
  last_applied_at: string | null;
  learn_reason: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, match_type, match_field, match_value, category_code, project_code, "
  + "is_active, match_count, last_applied_at, learn_reason, created_at, updated_at";

const toApi = (row: Row) => ({
  id: row.id,
  matchType: row.match_type,
  matchField: row.match_field,
  matchValue: row.match_value,
  categoryCode: row.category_code,
  projectCode: row.project_code,
  isActive: row.is_active,
  matchCount: Number.parseInt(row.match_count, 10),
  lastAppliedAt: row.last_applied_at,
  learnReason: row.learn_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

export const rulesRouter = router({
  list: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}/rules", tags: ["rules"] } })
    .input(tenantPathInput)
    .output(z.array(ruleSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `SELECT ${COLUMNS} FROM tax.categorization_rule
           ORDER BY is_active DESC, match_count DESC, created_at DESC`,
        ),
      );
      return result.rows.map(toApi);
    }),

  create: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/rules", tags: ["rules"] } })
    .input(
      tenantPathInput.extend({
        matchType: z.enum(MATCH_TYPES),
        matchField: z.enum(MATCH_FIELDS),
        matchValue: z.string().min(1).max(500),
        categoryCode: z.string().nullish(),
        projectCode: z.string().nullish(),
        learnReason: z.string().max(1000).nullish(),
      }),
    )
    .output(ruleSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `INSERT INTO tax.categorization_rule
             (tenant_id, match_type, match_field, match_value, category_code, project_code, learn_reason)
           VALUES (core.current_tenant_id(), $1, $2, $3, $4, $5, $6)
           RETURNING ${COLUMNS}`,
          [
            input.matchType,
            input.matchField,
            input.matchValue,
            input.categoryCode ?? null,
            input.projectCode ?? null,
            input.learnReason ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toApi(row);
    }),

  update: tenantProcedure
    .meta({ openapi: { method: "PATCH", path: "/tenants/{tenantId}/rules/{id}", tags: ["rules"] } })
    .input(
      tenantPathInput.extend({
        id: z.string().uuid(),
        categoryCode: z.string().nullish(),
        projectCode: z.string().nullish(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(ruleSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query<Row>(
          `UPDATE tax.categorization_rule SET
             category_code = CASE WHEN $2::boolean THEN $3 ELSE category_code END,
             project_code  = CASE WHEN $4::boolean THEN $5 ELSE project_code END,
             is_active     = COALESCE($6, is_active)
           WHERE id = $1
           RETURNING ${COLUMNS}`,
          [
            input.id,
            input.categoryCode !== undefined, input.categoryCode ?? null,
            input.projectCode !== undefined,  input.projectCode ?? null,
            input.isActive ?? null,
          ],
        ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return toApi(row);
    }),

  delete: tenantProcedure
    .meta({ openapi: { method: "DELETE", path: "/tenants/{tenantId}/rules/{id}", tags: ["rules"] } })
    .input(tenantPathInput.extend({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, (client) =>
        client.query("DELETE FROM tax.categorization_rule WHERE id = $1 RETURNING id", [input.id]),
      );
      if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  // Apply active rules to all uncategorised transactions in this tenant.
  // Returns how many rows were touched. We do everything in a single SQL
  // statement so RLS keeps it tenant-scoped and we don't shuffle rows over
  // the wire just to update them.
  // Procedure name avoids `apply` because that collides with Function.prototype.apply
  // when tRPC walks the router via dot-notation lookup.
  applyAll: tenantProcedure
    .meta({ openapi: { method: "POST", path: "/tenants/{tenantId}/rules/apply", tags: ["rules"] } })
    .input(tenantPathInput)
    .output(z.object({ updatedCount: z.number() }))
    .mutation(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(ctx.tenantId, { userId: ctx.authUser.userId }, async (client) => {
        // Match each transaction to the best (most-recent) active rule whose
        // pattern hits the chosen field. CONTAINS = case-insensitive substring,
        // EXACT = case-insensitive equality, REGEX = ~* operator.
        const upd = await client.query<{ id: string }>(
          `WITH candidates AS (
             SELECT DISTINCT ON (t.id)
               t.id              AS transaction_id,
               r.id              AS rule_id,
               r.category_code   AS new_category,
               r.project_code    AS new_project
             FROM tax.transaction t
             JOIN tax.categorization_rule r
               ON r.is_active
              AND (
                (r.match_type = 'contains' AND
                  CASE r.match_field
                    WHEN 'merchant'    THEN coalesce(t.merchant,'')    ILIKE '%' || r.match_value || '%'
                    WHEN 'description' THEN coalesce(t.description,'') ILIKE '%' || r.match_value || '%'
                    WHEN 'name'        THEN coalesce(t.name,'')        ILIKE '%' || r.match_value || '%'
                    WHEN 'text'        THEN coalesce(t.text,'')        ILIKE '%' || r.match_value || '%'
                  END)
                OR (r.match_type = 'exact' AND
                  CASE r.match_field
                    WHEN 'merchant'    THEN lower(coalesce(t.merchant,''))    = lower(r.match_value)
                    WHEN 'description' THEN lower(coalesce(t.description,'')) = lower(r.match_value)
                    WHEN 'name'        THEN lower(coalesce(t.name,''))        = lower(r.match_value)
                    WHEN 'text'        THEN lower(coalesce(t.text,''))        = lower(r.match_value)
                  END)
                OR (r.match_type = 'regex' AND
                  CASE r.match_field
                    WHEN 'merchant'    THEN coalesce(t.merchant,'')    ~* r.match_value
                    WHEN 'description' THEN coalesce(t.description,'') ~* r.match_value
                    WHEN 'name'        THEN coalesce(t.name,'')        ~* r.match_value
                    WHEN 'text'        THEN coalesce(t.text,'')        ~* r.match_value
                  END)
              )
             WHERE t.category_code IS NULL
             ORDER BY t.id, r.created_at DESC
           )
           UPDATE tax.transaction t
              SET category_code = COALESCE(c.new_category, t.category_code),
                  project_code  = COALESCE(c.new_project,  t.project_code),
                  applied_rule_id = c.rule_id
             FROM candidates c
            WHERE t.id = c.transaction_id
              AND (c.new_category IS NOT NULL OR c.new_project IS NOT NULL)
           RETURNING t.id, c.rule_id`,
        );

        if (upd.rowCount && upd.rowCount > 0) {
          await client.query(
            `UPDATE tax.categorization_rule r
                SET match_count = r.match_count + sub.cnt,
                    last_applied_at = now()
              FROM (SELECT applied_rule_id AS rid, COUNT(*) AS cnt
                      FROM tax.transaction
                     WHERE applied_rule_id IS NOT NULL
                  GROUP BY applied_rule_id) sub
             WHERE r.id = sub.rid`,
          );
        }
        return upd;
      });
      return { updatedCount: result.rowCount ?? 0 };
    }),
});
