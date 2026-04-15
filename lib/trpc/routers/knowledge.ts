import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, authedProcedure } from "../init"
import { knowledgePackSchema } from "@/lib/db-types"
import {
  listPacks,
  getPack,
  setReviewStatus,
  upsertPack,
  hasStalePack,
} from "@/models/knowledge-packs"
import { refreshPack, readSeedContent, seedKnowledgePacksForUser } from "@/ai/knowledge-refresh"

const refreshOutputSchema = z.object({
  pack: knowledgePackSchema,
  provider: z.string(),
  model: z.string().nullable(),
  tokensUsed: z.number().nullable(),
  diffSummary: z.object({
    sizeBefore: z.number(),
    sizeAfter: z.number(),
    headingCountBefore: z.number(),
    headingCountAfter: z.number(),
  }),
})

export const knowledgeRouter = router({
  list: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(knowledgePackSchema))
    .query(async ({ ctx }) => {
      const packs = await listPacks(ctx.user.id)
      if (packs.length === 0) {
        // Lazy-seed for existing users who predate the v7 migration.
        await seedKnowledgePacksForUser(ctx.user.id)
        return listPacks(ctx.user.id)
      }
      return packs
    }),

  get: authedProcedure
    .input(z.object({ slug: z.string() }))
    .output(knowledgePackSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getPack(ctx.user.id, input.slug)
    }),

  refresh: authedProcedure
    .input(z.object({ slug: z.string() }))
    .output(refreshOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await refreshPack(ctx.user.id, input.slug)
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "refresh failed",
        })
      }
    }),

  markVerified: authedProcedure
    .input(z.object({ slug: z.string() }))
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setReviewStatus(ctx.user.id, input.slug, "verified")
      return { ok: true }
    }),

  resetToSeed: authedProcedure
    .input(z.object({ slug: z.string() }))
    .output(knowledgePackSchema)
    .mutation(async ({ ctx, input }) => {
      const seed = await readSeedContent(input.slug)
      if (!seed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "no seed available for this slug" })
      }
      return upsertPack({
        userId: ctx.user.id,
        slug: input.slug,
        title: seed.title,
        content: seed.content,
        reviewStatus: "seed",
        refreshIntervalDays: 30,
      })
    }),

  hasStale: authedProcedure
    .input(z.object({}).optional())
    .output(z.object({ stale: z.boolean() }))
    .query(async ({ ctx }) => {
      const stale = await hasStalePack(ctx.user.id)
      return { stale }
    }),
})
