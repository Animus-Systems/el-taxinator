import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  createPastSearch,
  listPastSearches,
  getLatestPastSearch,
  getPastSearch,
  diffResults,
  deletePastSearch,
  deletePastSearchesByTopic,
} from "@/models/past-searches"
import { pastSearchSchema, searchResultItemSchema, type SearchResultItem } from "@/lib/db-types"

const searchResultItemInputSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional().default(""),
  source: z.string().optional().default(""),
  publishedDate: z.string().nullable().optional().default(null),
})

export const pastSearchesRouter = router({
  // ── Create ────────────────────────────────────────────────────────────────

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/past-searches" } })
    .input(
      z.object({
        query: z.string().min(1),
        topic: z.string().min(1),
        results: z.array(searchResultItemInputSchema),
      }),
    )
    .output(pastSearchSchema)
    .mutation(async ({ ctx, input }) => {
      return createPastSearch({
        userId: ctx.user.id,
        query: input.query,
        topic: input.topic,
        results: input.results,
      })
    }),

  // ── List ──────────────────────────────────────────────────────────────────

  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/past-searches" } })
    .input(
      z.object({
        topic: z.string().optional(),
        limit: z.number().min(1).max(100).optional().default(20),
      }),
    )
    .output(z.array(pastSearchSchema))
    .query(async ({ ctx, input }) => {
      return listPastSearches(ctx.user.id, input.topic, input.limit)
    }),

  // ── Get latest ────────────────────────────────────────────────────────────

  getLatest: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/past-searches/latest" } })
    .input(
      z.object({
        topic: z.string().min(1),
      }),
    )
    .output(pastSearchSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getLatestPastSearch(ctx.user.id, input.topic)
    }),

  // ── Diff — compare current results against latest past search ────────────

  diff: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/past-searches/diff" } })
    .input(
      z.object({
        topic: z.string().min(1),
        currentResults: z.array(searchResultItemInputSchema),
      }),
    )
    .output(
      z.object({
        previousSearch: pastSearchSchema.nullable(),
        newResults: z.array(searchResultItemSchema),
      }),
    )
    .query(async ({ ctx, input }) => {
      const previous = await getLatestPastSearch(ctx.user.id, input.topic)
      const previousResults = previous?.results ?? []
      const newResults = diffResults(previousResults, input.currentResults as SearchResultItem[])
      return {
        previousSearch: previous,
        newResults,
      }
    }),

  // ── Delete ────────────────────────────────────────────────────────────────

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/past-searches/{id}" } })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(z.object({ deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const count = await deletePastSearch(ctx.user.id, input.id)
      return { deleted: count > 0 }
    }),

  deleteByTopic: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/past-searches/by-topic" } })
    .input(
      z.object({
        topic: z.string().min(1),
      }),
    )
    .output(z.object({ deleted: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const count = await deletePastSearchesByTopic(ctx.user.id, input.topic)
      return { deleted: count }
    }),
})