import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} from "@/models/clients"
import type { ClientData } from "@/models/clients"
import { clientSchema } from "@/lib/db-types"

const clientInputSchema = z.object({
  name: z.string().min(1).max(256),
  email: z.string().email().nullish(),
  phone: z.string().max(64).nullish(),
  address: z.string().max(512).nullish(),
  taxId: z.string().max(64).nullish(),
  notes: z.string().max(1024).nullish(),
})

export const clientsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/clients" } })
    .input(z.object({}))
    .output(z.array(clientSchema))
    .query(async ({ ctx }) => {
      return getClients(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/clients/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(clientSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getClientById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/clients" } })
    .input(clientInputSchema)
    .output(clientSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createClient(ctx.user.id, input as ClientData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/clients/{id}" } })
    .input(z.object({ id: z.string() }).merge(clientInputSchema))
    .output(clientSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateClient(id, ctx.user.id, data as ClientData)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/clients/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(clientSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteClient(input.id, ctx.user.id)
    }),
})
