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
});
