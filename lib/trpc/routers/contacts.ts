import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
} from "@/models/contacts"
import type { ContactData } from "@/models/contacts"
import { contactSchema } from "@/lib/db-types"

const contactInputSchema = z.object({
  name: z.string().min(1).max(256),
  email: z.string().email().nullish().or(z.literal("")),
  phone: z.string().max(64).nullish(),
  mobile: z.string().max(64).nullish(),
  address: z.string().max(512).nullish(),
  city: z.string().max(128).nullish(),
  postalCode: z.string().max(32).nullish(),
  province: z.string().max(128).nullish(),
  country: z.string().max(128).nullish(),
  taxId: z.string().max(64).nullish(),
  bankDetails: z.string().max(1024).nullish(),
  notes: z.string().max(1024).nullish(),
  role: z.enum(["client", "supplier", "both"]).optional(),
  kind: z.enum(["company", "person"]).optional(),
})

export const contactsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/contacts" } })
    .input(z.object({}))
    .output(z.array(contactSchema))
    .query(async ({ ctx }) => {
      return getContacts(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/contacts/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(contactSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getContactById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/contacts" } })
    .input(contactInputSchema)
    .output(contactSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createContact(ctx.user.id, input as ContactData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/contacts/{id}" } })
    .input(z.object({ id: z.string() }).merge(contactInputSchema))
    .output(contactSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateContact(id, ctx.user.id, data as ContactData)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/contacts/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(contactSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteContact(input.id, ctx.user.id)
    }),

  /**
   * Commit a batch of AI-extracted contacts at once. Used by the
   * "Import contacts with AI" flow on /contacts — the server extraction
   * route returns candidates; the user reviews+ticks rows in the UI,
   * then submits the selected ones through this mutation.
   *
   * Rows are inserted one-by-one (small N, no need for a bulk insert);
   * duplicates are NOT prevented here — the UI shows a "looks like
   * existing" hint so the user chooses before submitting.
   */
  bulkCreate: authedProcedure
    .input(z.object({ contacts: z.array(contactInputSchema).min(1).max(200) }))
    .output(z.object({ created: z.number(), contacts: z.array(contactSchema) }))
    .mutation(async ({ ctx, input }) => {
      const created = []
      for (const data of input.contacts) {
        const row = await createContact(ctx.user.id, data as ContactData)
        if (row) created.push(row)
      }
      return { created: created.length, contacts: created }
    }),
})
