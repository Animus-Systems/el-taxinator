import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router, tenantAdminProcedure, tenantProcedure } from "../trpc.js";

const ENTITY_TYPES = ["autonomo", "sl", "individual"] as const;
const TENANT_ROLES = ["owner", "admin", "accountant", "member"] as const;
const SLUG_RE = /^[a-z0-9-]+$/;

const tenantPathInput = z.object({ tenantId: z.string().uuid() });

const tenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  entityType: z.enum(ENTITY_TYPES),
  createdAt: z.string(),
});

const tenantMembershipSchema = z.object({
  tenant: tenantSchema,
  role: z.enum(TENANT_ROLES),
  status: z.string(),
});

const tenantMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(TENANT_ROLES),
  status: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
});

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  entity_type: typeof ENTITY_TYPES[number];
  created_at: string;
};

type MembershipRow = TenantRow & {
  role: typeof TENANT_ROLES[number];
  status: string;
};

type MemberRow = {
  user_id: string;
  role: typeof TENANT_ROLES[number];
  status: string;
};

const slugifyName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const tenantsRouter = router({
  list: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/tenants", tags: ["tenants"] } })
    .input(z.void())
    .output(z.array(tenantMembershipSchema))
    .query(async ({ ctx }) => {
      // Membership rows are tenant-scoped via RLS, so a list-without-tenant must
      // run on the admin pool (BYPASSRLS) and filter by user_id explicitly.
      const result = await ctx.appDb.adminQuery<MembershipRow>(
        "SELECT t.id, t.name, t.slug, t.entity_type, t.created_at, tm.role, tm.status "
          + "FROM core.tenant t "
          + "JOIN core.tenant_member tm ON tm.tenant_id = t.id "
          + "WHERE tm.user_id = $1 "
          + "ORDER BY t.entity_type='individual' DESC, t.created_at ASC",
        [ctx.authUser.userId],
      );
      return result.rows.map((row) => ({
        tenant: {
          id: row.id,
          name: row.name,
          slug: row.slug,
          entityType: row.entity_type,
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString(),
        },
        role: row.role,
        status: row.status,
      }));
    }),

  create: protectedProcedure
    .meta({ openapi: { method: "POST", path: "/tenants", tags: ["tenants"] } })
    .input(z.object({
      name: z.string().min(1).max(200),
      entityType: z.enum(["autonomo", "sl"]),
      slug: z.string().min(1).max(60).regex(SLUG_RE).optional(),
    }))
    .output(tenantSchema)
    .mutation(async ({ ctx, input }) => {
      const baseSlug = input.slug ?? slugifyName(input.name);
      if (!baseSlug || !SLUG_RE.test(baseSlug)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not derive a valid slug from name." });
      }

      const created = await ctx.appDb.withAdmin(async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("SELECT core.ensure_user_exists($1)", [ctx.authUser.userId]);

          // Slug uniqueness: append -2, -3, ... on collision.
          let attemptSlug = baseSlug;
          for (let suffix = 2; suffix < 50; suffix++) {
            const collision = await client.query<{ id: string }>(
              "SELECT id FROM core.tenant WHERE slug = $1",
              [attemptSlug],
            );
            if (!collision.rowCount || collision.rowCount === 0) break;
            attemptSlug = `${baseSlug}-${suffix}`;
          }

          const insertTenant = await client.query<TenantRow>(
            "INSERT INTO core.tenant(name, slug, entity_type) VALUES ($1, $2, $3) "
              + "RETURNING id, name, slug, entity_type, created_at",
            [input.name, attemptSlug, input.entityType],
          );
          const tenant = insertTenant.rows[0];
          if (!tenant) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tenant insert returned no row." });

          await client.query(
            "INSERT INTO core.tenant_member(tenant_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
            [tenant.id, ctx.authUser.userId],
          );
          await client.query("COMMIT");
          return tenant;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });

      return {
        id: created.id,
        name: created.name,
        slug: created.slug,
        entityType: created.entity_type,
        createdAt: typeof created.created_at === "string"
          ? created.created_at
          : new Date(created.created_at).toISOString(),
      };
    }),

  get: tenantProcedure
    .meta({ openapi: { method: "GET", path: "/tenants/{tenantId}", tags: ["tenants"] } })
    .input(z.object({ tenantId: z.string().uuid() }))
    .output(tenantSchema.extend({ role: z.enum(TENANT_ROLES) }))
    .query(async ({ ctx }) => {
      const result = await ctx.appDb.withTenant(
        ctx.tenantId,
        { userId: ctx.authUser.userId },
        async (client) =>
          client.query<TenantRow>(
            "SELECT id, name, slug, entity_type, created_at FROM core.tenant WHERE id = $1",
            [ctx.tenantId],
          ),
      );
      const row = result.rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found." });
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        entityType: row.entity_type,
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString(),
        role: ctx.membership.role as typeof TENANT_ROLES[number],
      };
    }),

  invites: router({
    list: tenantAdminProcedure
      .meta({
        openapi: { method: "GET", path: "/tenants/{tenantId}/invites", tags: ["tenants"] },
      })
      .input(tenantPathInput)
      .output(z.array(z.object({
        id: z.string().uuid(),
        email: z.string(),
        role: z.enum(TENANT_ROLES),
        createdAt: z.string(),
        expiresAt: z.string(),
        acceptedAt: z.string().nullable(),
        revokedAt: z.string().nullable(),
      })))
      .query(async ({ ctx }) => {
        const result = await ctx.appDb.withTenant(
          ctx.tenantId,
          { userId: ctx.authUser.userId },
          async (client) =>
            client.query<{
              id: string;
              email: string;
              role: typeof TENANT_ROLES[number];
              created_at: string;
              expires_at: string;
              accepted_at: string | null;
              revoked_at: string | null;
            }>(
              "SELECT id, email::text AS email, role, created_at, expires_at, accepted_at, revoked_at "
                + "FROM core.tenant_invite ORDER BY created_at DESC",
            ),
        );
        return result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          acceptedAt: row.accepted_at,
          revokedAt: row.revoked_at,
        }));
      }),

    create: tenantAdminProcedure
      .meta({
        openapi: { method: "POST", path: "/tenants/{tenantId}/invites", tags: ["tenants"] },
      })
      .input(tenantPathInput.extend({
        email: z.string().email(),
        role: z.enum(TENANT_ROLES).default("member"),
        expiresInDays: z.number().int().min(1).max(180).default(14),
      }))
      .output(z.object({ id: z.string().uuid(), email: z.string(), role: z.enum(TENANT_ROLES), expiresAt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // ensure_user_exists keeps invited_by FK satisfied — admin's user
        // projection might be missing if this is the first action they take.
        const result = await ctx.appDb.withTenant(
          ctx.tenantId,
          { userId: ctx.authUser.userId },
          async (client) => {
            await client.query("SELECT core.ensure_user_exists($1)", [ctx.authUser.userId]);
            return client.query<{ id: string; email: string; role: typeof TENANT_ROLES[number]; expires_at: string }>(
              `INSERT INTO core.tenant_invite (tenant_id, email, role, invited_by, expires_at)
               VALUES (core.current_tenant_id(), $1, $2, $3, now() + ($4 || ' days')::interval)
               ON CONFLICT (tenant_id, email) DO UPDATE
                 SET role        = EXCLUDED.role,
                     expires_at  = EXCLUDED.expires_at,
                     accepted_at = NULL,
                     revoked_at  = NULL,
                     invited_by  = EXCLUDED.invited_by
               RETURNING id, email::text AS email, role, expires_at`,
              [input.email, input.role, ctx.authUser.userId, input.expiresInDays],
            );
          },
        );
        const row = result.rows[0];
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return {
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at,
        };
      }),

    revoke: tenantAdminProcedure
      .meta({
        openapi: { method: "DELETE", path: "/tenants/{tenantId}/invites/{id}", tags: ["tenants"] },
      })
      .input(tenantPathInput.extend({ id: z.string().uuid() }))
      .output(z.object({ ok: z.literal(true) }))
      .mutation(async ({ ctx, input }) => {
        const result = await ctx.appDb.withTenant(
          ctx.tenantId,
          { userId: ctx.authUser.userId },
          (client) =>
            client.query(
              "UPDATE core.tenant_invite SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL RETURNING id",
              [input.id],
            ),
        );
        if (!result.rowCount) throw new TRPCError({ code: "NOT_FOUND" });
        return { ok: true as const };
      }),
  }),

  members: router({
    list: tenantProcedure
      .meta({
        openapi: { method: "GET", path: "/tenants/{tenantId}/members", tags: ["tenants"] },
      })
      .input(z.object({ tenantId: z.string().uuid() }))
      .output(z.array(tenantMemberSchema))
      .query(async ({ ctx }) => {
        const memberRows = await ctx.appDb.withTenant(
          ctx.tenantId,
          { userId: ctx.authUser.userId },
          async (client) =>
            client.query<MemberRow>(
              "SELECT user_id, role, status FROM core.tenant_member ORDER BY created_at ASC",
            ),
        );

        if (memberRows.rows.length === 0) return [];

        // Resolve emails / display names from identity_db (no JOIN possible
        // across databases). Single batched query keeps it cheap.
        const userIds = memberRows.rows.map((row) => row.user_id);
        const profiles = await ctx.identityDb.query<{
          id: string;
          email: string | null;
          display_name: string | null;
        }>(
          "SELECT id, email, display_name FROM iam.user_account WHERE id = ANY($1::uuid[])",
          [userIds],
        );
        const profileById = new Map(profiles.rows.map((row) => [row.id, row]));

        return memberRows.rows.map((row) => {
          const profile = profileById.get(row.user_id);
          return {
            userId: row.user_id,
            role: row.role,
            status: row.status,
            email: profile?.email ?? null,
            displayName: profile?.display_name ?? null,
          };
        });
      }),
  }),
});
