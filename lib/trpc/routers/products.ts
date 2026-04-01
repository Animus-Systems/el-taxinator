import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/models/products"
import type { ProductData } from "@/models/products"
import { productSchema } from "@/lib/db-types"

const productInputSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(512).nullish(),
  price: z.number(),
  currencyCode: z.string().max(5).default("EUR"),
  vatRate: z.number().min(0).max(100).default(21),
  unit: z.string().max(32).nullish(),
})

export const productsRouter = router({
  list: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/products" } })
    .input(z.object({}))
    .output(z.array(productSchema))
    .query(async ({ ctx }) => {
      return getProducts(ctx.user.id)
    }),

  getById: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/products/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(productSchema.nullable())
    .query(async ({ ctx, input }) => {
      return getProductById(input.id, ctx.user.id)
    }),

  create: authedProcedure
    .meta({ openapi: { method: "POST", path: "/api/v1/products" } })
    .input(productInputSchema)
    .output(productSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return createProduct(ctx.user.id, input as ProductData)
    }),

  update: authedProcedure
    .meta({ openapi: { method: "PUT", path: "/api/v1/products/{id}" } })
    .input(z.object({ id: z.string() }).merge(productInputSchema))
    .output(productSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return updateProduct(id, ctx.user.id, data as ProductData)
    }),

  delete: authedProcedure
    .meta({ openapi: { method: "DELETE", path: "/api/v1/products/{id}" } })
    .input(z.object({ id: z.string() }))
    .output(productSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return deleteProduct(input.id, ctx.user.id)
    }),
})
