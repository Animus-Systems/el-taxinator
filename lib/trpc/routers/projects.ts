import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
} from "@/models/projects"
import { projectSchema } from "@/lib/db-types"

const projectInputSchema = z.object({
  name: z.string().max(128),
  llmPrompt: z.string().max(512).nullish(),
  color: z.string().max(7).nullish(),
})

export const projectsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/projects" } })
    .input(z.object({}))
    .output(z.array(projectSchema))
    .query(async ({ ctx }) => {
      return getProjects(ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/projects" } })
    .input(projectInputSchema)
    .output(projectSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createProject(ctx.user.id, input)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/projects/{code}" } })
    .input(z.object({ code: z.string() }).merge(projectInputSchema))
    .output(projectSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { code, ...data } = input
      return updateProject(ctx.user.id, code, data)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/projects/{code}" } })
    .input(z.object({ code: z.string() }))
    .output(projectSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteProject(ctx.user.id, input.code)
    }),
})
