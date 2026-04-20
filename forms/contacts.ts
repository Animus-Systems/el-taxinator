import { z } from "zod"

export const contactFormSchema = z.object({
  name: z.string().min(1).max(256),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(64).optional(),
  mobile: z.string().max(64).optional(),
  address: z.string().max(512).optional(),
  city: z.string().max(128).optional(),
  postalCode: z.string().max(32).optional(),
  province: z.string().max(128).optional(),
  country: z.string().max(128).optional(),
  taxId: z.string().max(64).optional(),
  bankDetails: z.string().max(1024).optional(),
  notes: z.string().max(1024).optional(),
  role: z.enum(["client", "supplier", "both"]).default("client"),
  kind: z.enum(["company", "person"]).default("company"),
})

export type ContactFormData = z.infer<typeof contactFormSchema>
