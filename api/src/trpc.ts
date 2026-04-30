import { TRPCError, initTRPC } from "@trpc/server";
import type { OpenApiMeta } from "trpc-openapi";
import { config } from "./config.js";
import { appDb } from "./db/appDb.js";
import { identityDb } from "./db/identityDb.js";

export type AuthUser = { userId: string; email: string | null };

export type Context = {
  appDb: typeof appDb;
  identityDb: typeof identityDb;
  internal: boolean;
  authUser: AuthUser | null;
  req: {
    ip: string | null;
    userAgent: string | null;
    origin: string | null;
    tenantId: string | null;
  };
};

// `accountantWritable` opts a mutation in for the read-mostly accountant role.
// Any tenant mutation without this flag is rejected when the caller's
// membership.role is 'accountant'. Default-deny keeps surprises minimal —
// new mutations don't accidentally let accountants edit books unless we
// explicitly mark them safe.
export type TenantMeta = OpenApiMeta & { accountantWritable?: boolean };

export type Context2 = Context;

const t = initTRPC.context<Context>().meta<TenantMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const authUser = ctx.authUser;
  return next({ ctx: { ...ctx, authUser } });
});

export type TenantMembership = { role: string; status: string };

const fetchTenantMembership = async (
  tenantId: string,
  userId: string,
): Promise<TenantMembership | null> => {
  const result = await appDb.withTenant(
    tenantId,
    { userId },
    async (client) => client.query<TenantMembership>(
      "SELECT role, status FROM core.tenant_member WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    ),
  );
  return result.rows[0] ?? null;
};

export const tenantProcedure = protectedProcedure.use(async ({ ctx, next, type, meta }) => {
  const tenantId = ctx.req.tenantId;
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing tenantId in URL." });

  const membership = await fetchTenantMembership(tenantId, ctx.authUser.userId);
  if (!membership || membership.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this tenant." });
  }

  // Accountants are read-only by default. A handful of mutations (post a
  // comment, mark a filing filed, post a chat message) opt in via
  // .meta({ accountantWritable: true }).
  if (
    type === "mutation"
    && membership.role === "accountant"
    && !meta?.accountantWritable
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Accountants have read-only access to this tenant's books.",
    });
  }

  return next({ ctx: { ...ctx, tenantId, membership } });
});

export const tenantAdminProcedure = tenantProcedure.use(({ ctx, next }) => {
  if (!config.tenantAdminRoles.includes(ctx.membership.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant admin role required." });
  }
  return next({ ctx });
});
