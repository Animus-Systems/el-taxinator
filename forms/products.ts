import { z } from "zod"

export const productFormSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(512).optional(),
  price: z
    .string()
    .transform((val) => Math.round(parseFloat(val || "0") * 100)),
  currencyCode: z.string().max(5).default("EUR"),
  vatRate: z
    .string()
    .transform((val) => parseFloat(val || "21")),
  unit: z.string().max(32).optional(),
})

export type ProductFormData = z.infer<typeof productFormSchema>
