import { z } from "zod"

export const clientFormSchema = z.object({
  name: z.string().min(1).max(256),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(64).optional(),
  address: z.string().max(512).optional(),
  taxId: z.string().max(64).optional(),
  notes: z.string().max(1024).optional(),
})

export type ClientFormData = z.infer<typeof clientFormSchema>
