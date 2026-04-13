import { z } from "zod"

export const ruleFormSchema = z.object({
  name: z.string().min(1).max(128),
  matchType: z.enum(["contains", "starts_with", "exact", "regex"]).default("contains"),
  matchField: z.enum(["name", "merchant", "description"]).default("name"),
  matchValue: z.string().min(1).max(256),
  categoryCode: z.string().max(64).nullish(),
  projectCode: z.string().max(64).nullish(),
  type: z.enum(["expense", "income"]).nullish(),
  note: z.string().max(512).nullish(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
})

export type RuleFormData = z.infer<typeof ruleFormSchema>
