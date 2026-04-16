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
import { readSeedContent, seedKnowledgePacksForUser, SEED_PACKS, RefreshError } from "@/ai/knowledge-refresh"
import { enqueueKnowledgeRefresh } from "@/ai/knowledge-refresh-jobs"

const refreshQueueSchema = z.object({
  accepted: z.boolean(),
  pack: knowledgePackSchema,
})

/**
 * RefreshError details are carried in TRPCError.message as a JSON-serialisable
 * payload. The knowledge settings page parses this to render a typed message
 * like "OpenRouter (llama-3.3-70b) returned malformed output" rather than a
 * generic failure toast.
 */
function encodeRefreshError(err: RefreshError): string {
  return JSON.stringify({
    refreshError: {
      code: err.code,
      providerName: err.providerName,
      modelName: err.modelName,
      message: err.message,
    },
  })
}

export const knowledgeRouter = router({
  list: authedProcedure
    .input(z.object({}).optional())
    .output(z.array(knowledgePackSchema))
    .query(async ({ ctx }) => {
      let packs = await listPacks(ctx.user.id)
      // Run the seeder when any known slug is missing — picks up legacy
      // users (0 packs) AND existing users who need the new topic packs
      // (personal-tax, property-tax, crypto-tax) added.
      if (packs.length < SEED_PACKS.length) {
        await seedKnowledgePacksForUser(ctx.user.id)
        packs = await listPacks(ctx.user.id)
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
    .output(refreshQueueSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await enqueueKnowledgeRefresh(ctx.user.id, input.slug)
      } catch (err) {
        if (err instanceof RefreshError) {
          const mapped: Record<RefreshError["code"], TRPCError["code"]> = {
            no_providers: "PRECONDITION_FAILED",
            all_providers_failed: "INTERNAL_SERVER_ERROR",
            malformed_output: "UNPROCESSABLE_CONTENT",
            truncated: "UNPROCESSABLE_CONTENT",
            not_found: "NOT_FOUND",
          }
          throw new TRPCError({
            code: mapped[err.code],
            message: encodeRefreshError(err),
          })
        }
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
        pendingReviewContent: null,
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
