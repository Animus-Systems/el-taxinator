import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

const meSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isActive: z.boolean(),
});

const authAttemptSchema = z.object({
  at: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  outcome: z.string(),
  reason: z.string().nullable(),
});

const securityEventSchema = z.object({
  eventAt: z.string(),
  eventType: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});

export const identityRouter = router({
  me: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/identity/me", tags: ["identity"] } })
    .input(z.void())
    .output(meSchema)
    .query(async ({ ctx }) => {
      const result = await ctx.identityDb.query<{
        id: string;
        email: string | null;
        email_verified: boolean;
        display_name: string | null;
        phone: string | null;
        avatar_url: string | null;
        is_active: boolean;
      }>(
        "SELECT id, email, email_verified, display_name, phone, avatar_url, is_active "
          + "FROM iam.user_account WHERE id = $1",
        [ctx.authUser.userId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("User not found.");
      }
      return {
        id: row.id,
        email: row.email,
        emailVerified: row.email_verified,
        displayName: row.display_name,
        phone: row.phone,
        avatarUrl: row.avatar_url,
        isActive: row.is_active,
      };
    }),

  // Recent authentication attempts (success + failure) for the current user.
  // Surfaced to the user under "Security" so they can spot unfamiliar logins.
  // The same data is exposed to platform-admin tooling via admin.lockouts_last_10m
  // (vendored from canarias) but that view is direct-DB only.
  recentAuthAttempts: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/identity/me/auth-attempts", tags: ["identity"] } })
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .output(z.array(authAttemptSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.identityDb.query<{
        at: string;
        ip: string | null;
        user_agent: string | null;
        outcome: string;
        reason: string | null;
      }>(
        "SELECT at, ip::text AS ip, user_agent, outcome, reason "
          + "FROM iam.auth_attempt WHERE user_id = $1 "
          + "ORDER BY at DESC LIMIT $2",
        [ctx.authUser.userId, input.limit],
      );
      return result.rows.map((row) => ({
        at: row.at,
        ip: row.ip,
        userAgent: row.user_agent,
        outcome: row.outcome,
        reason: row.reason,
      }));
    }),

  recentSecurityEvents: protectedProcedure
    .meta({ openapi: { method: "GET", path: "/identity/me/security-events", tags: ["identity"] } })
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .output(z.array(securityEventSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.identityDb.query<{
        event_at: string;
        event_type: string;
        ip: string | null;
        user_agent: string | null;
      }>(
        "SELECT event_at, event_type, ip::text AS ip, user_agent "
          + "FROM iam.security_event WHERE user_id = $1 "
          + "ORDER BY event_at DESC LIMIT $2",
        [ctx.authUser.userId, input.limit],
      );
      return result.rows.map((row) => ({
        eventAt: row.event_at,
        eventType: row.event_type,
        ip: row.ip,
        userAgent: row.user_agent,
      }));
    }),
});
