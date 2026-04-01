import { z } from "zod"

// ---------------------------------------------------------------------------
// JsonValue — recursive JSON-compatible type
// ---------------------------------------------------------------------------

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// Use z.any() with a type cast — Zod v4 lazy/recursive types have complex generics
// that create inference issues; the schemas are used for type generation, not runtime validation.
const jsonValueSchema = z.any() as z.ZodType<JsonValue>

// ---------------------------------------------------------------------------
// Zod schemas (used for runtime validation of raw DB rows after camelCase mapping)
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  stripeCustomerId: z.string().nullable(),
  membershipPlan: z.string().nullable(),
  membershipExpiresAt: z.date().nullable(),
  emailVerified: z.boolean(),
  storageUsed: z.number(),
  storageLimit: z.number(),
  aiBalance: z.number(),
  businessName: z.string().nullable(),
  businessAddress: z.string().nullable(),
  businessBankDetails: z.string().nullable(),
  businessLogo: z.string().nullable(),
  businessTaxId: z.string().nullable(),
})

export const sessionSchema = z.object({
  id: z.string(),
  token: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  userId: z.string(),
})

export const accountSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  providerId: z.string(),
  userId: z.string(),
  accessToken: z.string().nullable(),
  refreshToken: z.string().nullable(),
  idToken: z.string().nullable(),
  accessTokenExpiresAt: z.date().nullable(),
  refreshTokenExpiresAt: z.date().nullable(),
  scope: z.string().nullable(),
  password: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const verificationSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  value: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const settingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  value: z.string().nullable(),
})

/** i18n text: plain string OR locale map like {en: "Name", es: "Nombre"} */
export const i18nText = z.union([z.string(), z.record(z.string(), z.string())])
export type I18nText = z.infer<typeof i18nText>

export const categorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  code: z.string(),
  name: i18nText,
  color: z.string(),
  llmPrompt: i18nText.nullable(),
  createdAt: z.date(),
})

export const projectSchema = z.object({
  id: z.string(),
  userId: z.string(),
  code: z.string(),
  name: i18nText,
  color: z.string(),
  llmPrompt: i18nText.nullable(),
  createdAt: z.date(),
})

export const fieldSchema = z.object({
  id: z.string(),
  userId: z.string(),
  code: z.string(),
  name: i18nText,
  type: z.string(),
  llmPrompt: z.string().nullable(),
  options: jsonValueSchema.nullable(),
  createdAt: z.date(),
  isVisibleInList: z.boolean(),
  isVisibleInAnalysis: z.boolean(),
  isRequired: z.boolean(),
  isExtra: z.boolean(),
})

export const fileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  filename: z.string(),
  path: z.string(),
  mimetype: z.string(),
  metadata: jsonValueSchema.nullable(),
  isReviewed: z.boolean(),
  isSplitted: z.boolean(),
  cachedParseResult: jsonValueSchema.nullable(),
  createdAt: z.date(),
})

export const transactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  merchant: z.string().nullable(),
  total: z.number().nullable(),
  currencyCode: z.string().nullable(),
  convertedTotal: z.number().nullable(),
  convertedCurrencyCode: z.string().nullable(),
  type: z.string().nullable(),
  items: jsonValueSchema,
  note: z.string().nullable(),
  files: jsonValueSchema,
  extra: jsonValueSchema.nullable(),
  categoryCode: z.string().nullable(),
  projectCode: z.string().nullable(),
  issuedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  text: z.string().nullable(),
  deductible: z.boolean().nullable(),
})

export const currencySchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
})

export const appDataSchema = z.object({
  id: z.string(),
  app: z.string(),
  userId: z.string(),
  data: jsonValueSchema,
})

export const progressSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  data: jsonValueSchema.nullable(),
  current: z.number(),
  total: z.number(),
  createdAt: z.date(),
})

export const clientSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  taxId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const productSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  currencyCode: z.string(),
  vatRate: z.number(),
  unit: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const quoteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  clientId: z.string().nullable(),
  number: z.string(),
  status: z.string(),
  issueDate: z.date(),
  expiryDate: z.date().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const quoteItemSchema = z.object({
  id: z.string(),
  quoteId: z.string(),
  productId: z.string().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  vatRate: z.number(),
  position: z.number(),
})

export const invoiceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  clientId: z.string().nullable(),
  quoteId: z.string().nullable(),
  number: z.string(),
  status: z.string(),
  issueDate: z.date(),
  dueDate: z.date().nullable(),
  paidAt: z.date().nullable(),
  notes: z.string().nullable(),
  irpfRate: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const invoiceItemSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  productId: z.string().nullable(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  vatRate: z.number(),
  position: z.number(),
})

export const timeEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  description: z.string().nullable(),
  projectCode: z.string().nullable(),
  clientId: z.string().nullable(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  durationMinutes: z.number().nullable(),
  hourlyRate: z.number().nullable(),
  currencyCode: z.string().nullable(),
  isBillable: z.boolean(),
  isInvoiced: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const accountantInviteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  token: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  permissions: jsonValueSchema,
  isActive: z.boolean(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const accountantAccessLogSchema = z.object({
  id: z.string(),
  inviteId: z.string(),
  section: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  accessedAt: z.date(),
})

export const accountantCommentSchema = z.object({
  id: z.string(),
  inviteId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// ---------------------------------------------------------------------------
// TypeScript interfaces (inferred from Zod schemas for single source of truth)
// ---------------------------------------------------------------------------

export type User = z.infer<typeof userSchema>
export type Session = z.infer<typeof sessionSchema>
export type Account = z.infer<typeof accountSchema>
export type Verification = z.infer<typeof verificationSchema>
export type Setting = z.infer<typeof settingSchema>
export type Category = z.infer<typeof categorySchema>
export type Project = z.infer<typeof projectSchema>
export type Field = z.infer<typeof fieldSchema>
export type File = z.infer<typeof fileSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type Currency = z.infer<typeof currencySchema>
export type AppData = z.infer<typeof appDataSchema>
export type Progress = z.infer<typeof progressSchema>
export type Client = z.infer<typeof clientSchema>
export type Product = z.infer<typeof productSchema>
export type Quote = z.infer<typeof quoteSchema>
export type QuoteItem = z.infer<typeof quoteItemSchema>
export type Invoice = z.infer<typeof invoiceSchema>
export type InvoiceItem = z.infer<typeof invoiceItemSchema>
export type TimeEntry = z.infer<typeof timeEntrySchema>
export type AccountantInvite = z.infer<typeof accountantInviteSchema>
export type AccountantAccessLog = z.infer<typeof accountantAccessLogSchema>
export type AccountantComment = z.infer<typeof accountantCommentSchema>

// ---------------------------------------------------------------------------
// Input types for create / update operations
// ---------------------------------------------------------------------------

export interface TransactionCreateInput {
  userId: string
  name?: string | null
  description?: string | null
  merchant?: string | null
  total?: number | null
  currencyCode?: string | null
  convertedTotal?: number | null
  convertedCurrencyCode?: string | null
  type?: string | null
  items?: unknown
  note?: string | null
  files?: unknown
  extra?: unknown | null
  categoryCode?: string | null
  projectCode?: string | null
  issuedAt?: Date | null
  text?: string | null
  deductible?: boolean | null
}

export interface TransactionUpdateInput {
  name?: string | null
  description?: string | null
  merchant?: string | null
  total?: number | null
  currencyCode?: string | null
  convertedTotal?: number | null
  convertedCurrencyCode?: string | null
  type?: string | null
  items?: unknown
  note?: string | null
  files?: unknown
  extra?: unknown | null
  categoryCode?: string | null
  projectCode?: string | null
  issuedAt?: Date | null
  text?: string | null
  deductible?: boolean | null
}

export interface InvoiceItemInput {
  productId?: string | null
  description: string
  quantity?: number
  unitPrice: number
  vatRate?: number
  position?: number
}

export interface InvoiceCreateInput {
  userId: string
  clientId?: string | null
  quoteId?: string | null
  number: string
  status?: string
  issueDate: Date
  dueDate?: Date | null
  notes?: string | null
  irpfRate?: number
  items: InvoiceItemInput[]
}

export interface QuoteItemInput {
  productId?: string | null
  description: string
  quantity?: number
  unitPrice: number
  vatRate?: number
  position?: number
}

export interface QuoteCreateInput {
  userId: string
  clientId?: string | null
  number: string
  status?: string
  issueDate: Date
  expiryDate?: Date | null
  notes?: string | null
  items: QuoteItemInput[]
}

export interface ClientCreateInput {
  userId: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  taxId?: string | null
  notes?: string | null
}

export interface ProductCreateInput {
  userId: string
  name: string
  description?: string | null
  price?: number
  currencyCode?: string
  vatRate?: number
  unit?: string | null
}

export interface TimeEntryCreateInput {
  userId: string
  description?: string | null
  projectCode?: string | null
  clientId?: string | null
  startedAt: Date
  endedAt?: Date | null
  durationMinutes?: number | null
  hourlyRate?: number | null
  currencyCode?: string | null
  isBillable?: boolean
  isInvoiced?: boolean
  notes?: string | null
}

export interface TimeEntryUpdateInput {
  description?: string | null
  projectCode?: string | null
  clientId?: string | null
  startedAt?: Date
  endedAt?: Date | null
  durationMinutes?: number | null
  hourlyRate?: number | null
  currencyCode?: string | null
  isBillable?: boolean
  isInvoiced?: boolean
  notes?: string | null
}

export interface CategoryCreateInput {
  userId?: string
  code?: string
  name: string
  color?: string
  llmPrompt?: string | null
}

export interface ProjectCreateInput {
  userId?: string
  code?: string
  name: string
  color?: string
  llmPrompt?: string | null
}

export interface FieldCreateInput {
  userId?: string
  code?: string
  name: string
  type?: string
  llmPrompt?: string | null
  options?: unknown | null
  isVisibleInList?: boolean
  isVisibleInAnalysis?: boolean
  isRequired?: boolean
  isExtra?: boolean
}

export interface CurrencyCreateInput {
  userId?: string | null
  code: string
  name: string
}

export interface ProjectUpdateInput {
  name?: string
  color?: string
  llmPrompt?: string | null
}

export interface CategoryUpdateInput {
  name?: string
  color?: string
  llmPrompt?: string | null
}

export interface CurrencyUpdateInput {
  name?: string
}

export interface FieldUpdateInput {
  name?: string
  type?: string
  llmPrompt?: string | null
  options?: unknown | null
  isVisibleInList?: boolean
  isVisibleInAnalysis?: boolean
  isRequired?: boolean
  isExtra?: boolean
}

export interface SettingUpsertInput {
  userId: string
  code: string
  name: string
  description?: string | null
  value?: string | null
}
