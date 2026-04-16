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

export const entityTypeSchema = z.enum(["autonomo", "sl", "individual"])
export type EntityType = z.infer<typeof entityTypeSchema>

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
  entityType: entityTypeSchema.nullable(),
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
  taxFormRef: z.string().nullable().optional().default(null),
  isDefault: z.boolean().optional().default(false),
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
  accountId: z.string().nullable(),
  status: z.string(),
  appliedRuleId: z.string().nullable(),
})

export const currencySchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
})

export const accountTypeSchema = z.enum([
  "bank",
  "credit_card",
  "crypto_exchange",
  "crypto_wallet",
  "cash",
])
export type AccountTypeValue = z.infer<typeof accountTypeSchema>

export const bankAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  bankName: z.string().nullable(),
  currencyCode: z.string(),
  accountNumber: z.string().nullable(),
  notes: z.string().nullable(),
  accountType: accountTypeSchema,
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type BankAccount = z.infer<typeof bankAccountSchema>

// Crypto metadata lives inside `transactions.extra.crypto`. All fields are
// optional so the wizard can populate partially and flag `needs_review` when
// cost basis is unknown.
export const costBasisSourceSchema = z.enum(["manual", "fifo", "imported"])

export const cryptoMetaSchema = z.object({
  asset: z.string(),                              // ticker: BTC, ETH, ...
  quantity: z.string(),                           // decimal string for precision
  pricePerUnit: z.number().int().nullable(),      // EUR cents at disposal
  costBasisPerUnit: z.number().int().nullable(),  // EUR cents at acquisition
  costBasisSource: costBasisSourceSchema.default("manual"),
  realizedGainCents: z.number().int().nullable(),
  fxRate: z.number().nullable(),
  gatewayTransactionId: z.string().uuid().nullable(),
  fingerprint: z.string().nullable(),
})
export type CryptoMeta = z.infer<typeof cryptoMetaSchema>

// ---------------------------------------------------------------------------
// Wizard / conversational session
// ---------------------------------------------------------------------------

export const transactionReviewStatusSchema = z.enum([
  "needs_review",
  "business",
  "business_non_deductible",
  "personal_ignored",
])
export type TransactionReviewStatusValue = z.infer<typeof transactionReviewStatusSchema>

export const candidateConfidenceSchema = z.object({
  category: z.number(),
  type: z.number(),
  status: z.number(),
  overall: z.number(),
})

// Wizard LLM output for a candidate. `extra.crypto` populates the transaction's
// crypto metadata when the AI identifies a crypto disposal/purchase/reward.
export const candidateExtraSchema = z.object({
  crypto: cryptoMetaSchema.partial().optional(),
}).passthrough()

export const candidateUpdateSchema = z.object({
  rowIndex: z.number(),
  name: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  currencyCode: z.string().nullable().optional(),
  type: z.enum(["expense", "income"]).nullable().optional(),
  categoryCode: z.string().nullable().optional(),
  projectCode: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  status: transactionReviewStatusSchema.nullable().optional(),
  reasoning: z.string().optional(),
  confidence: candidateConfidenceSchema.optional(),
  extra: candidateExtraSchema.optional(),
})
export type CandidateUpdate = z.infer<typeof candidateUpdateSchema>

export const bulkActionSchema = z.object({
  description: z.string(),
  match: z.object({
    field: z.enum(["name", "merchant", "description"]),
    type: z.enum(["contains", "exact", "regex", "starts_with"]),
    value: z.string(),
  }),
  apply: z.object({
    categoryCode: z.string().nullable().optional(),
    projectCode: z.string().nullable().optional(),
    type: z.enum(["expense", "income"]).nullable().optional(),
    status: transactionReviewStatusSchema.nullable().optional(),
  }),
  affectedRowIndexes: z.array(z.number()).default([]),
  offerAsRule: z.boolean().default(false),
})
export type BulkAction = z.infer<typeof bulkActionSchema>

// ---------------------------------------------------------------------------
// Tax-optimization tips surfaced inline by the wizard
// ---------------------------------------------------------------------------

export const taxTipActionableSchema = z.enum([
  "save_as_fact",
  "propose_recategorization",
  "advisory",
])

export const taxTipSchema = z.object({
  rowIndex: z.number().nullable(),
  title: z.string(),
  body: z.string(),
  legalBasis: z.string(),
  actionable: taxTipActionableSchema.default("advisory"),
})
export type TaxTip = z.infer<typeof taxTipSchema>

export const wizardMessageRoleSchema = z.enum(["user", "assistant", "system"])

export const wizardMessageSchema = z.object({
  id: z.string(),
  role: wizardMessageRoleSchema,
  content: z.string(),
  createdAt: z.string(), // ISO timestamp
  candidateUpdates: z.array(candidateUpdateSchema).optional(),
  bulkActions: z.array(bulkActionSchema).optional(),
  clarifyingQuestions: z.array(z.string()).optional(),
  taxTips: z.array(taxTipSchema).optional(),
  status: z.enum(["ok", "failed"]).optional(),
  error: z.string().optional(),
})
export type WizardMessage = z.infer<typeof wizardMessageSchema>

export const businessFactValueSchema = z.object({
  text: z.string(),
  confidence: z.number().optional(),
  examples: z.array(z.string()).optional(),
})
export type BusinessFactValue = z.infer<typeof businessFactValueSchema>

export const businessFactSchema = z.object({
  id: z.string(),
  userId: z.string(),
  key: z.string(),
  value: businessFactValueSchema,
  source: z.enum(["wizard", "user", "inferred"]),
  learnedFromSessionId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type BusinessFact = z.infer<typeof businessFactSchema>

export const wizardAssistantReplySchema = z.object({
  assistantMessage: z.string(),
  candidateUpdates: z.array(candidateUpdateSchema).default([]),
  bulkActions: z.array(bulkActionSchema).default([]),
  clarifyingQuestions: z.array(z.string()).max(3).default([]),
  taxTips: z.array(taxTipSchema).default([]),
  businessFactsToSave: z
    .array(
      z.object({
        key: z.string(),
        value: businessFactValueSchema,
        confidence: z.number().optional(),
      }),
    )
    .default([]),
})
export type WizardAssistantReply = z.infer<typeof wizardAssistantReplySchema>

export const importSessionEntryModeSchema = z.enum(["csv", "pdf", "manual"])
export type ImportSessionEntryMode = z.infer<typeof importSessionEntryModeSchema>

export const importSessionStatusSchema = z.enum(["pending", "committed", "abandoned"])
export type ImportSessionStatus = z.infer<typeof importSessionStatusSchema>

export const importSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  accountId: z.string().nullable(),
  fileName: z.string().nullable(),
  fileType: z.string().nullable(),
  rowCount: z.number(),
  data: jsonValueSchema,
  columnMapping: jsonValueSchema.nullable(),
  status: z.string(),
  suggestedCategories: jsonValueSchema,
  entryMode: z.string(),
  messages: z.array(wizardMessageSchema),
  businessContextSnapshot: jsonValueSchema.nullable(),
  promptVersion: z.string().nullable(),
  title: z.string().nullable(),
  lastActivityAt: z.date(),
  pendingTurnAt: z.date().nullable(),
  fileId: z.string().nullable(),
  createdAt: z.date(),
})

export type ImportSession = z.infer<typeof importSessionSchema>

export const knowledgePackReviewStatusSchema = z.enum(["verified", "needs_review", "seed"])
export const knowledgePackRefreshStateSchema = z.enum([
  "idle",
  "queued",
  "running",
  "succeeded",
  "failed",
])

export const knowledgePackSchema = z.object({
  id: z.string(),
  userId: z.string(),
  slug: z.string(),
  title: z.string(),
  content: z.string(),
  sourcePrompt: z.string().nullable(),
  lastRefreshedAt: z.date().nullable(),
  refreshIntervalDays: z.number(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  reviewStatus: z.string(),
  refreshState: knowledgePackRefreshStateSchema,
  refreshMessage: z.string().nullable(),
  refreshStartedAt: z.date().nullable(),
  refreshFinishedAt: z.date().nullable(),
  refreshHeartbeatAt: z.date().nullable(),
  pendingReviewContent: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type KnowledgePack = z.infer<typeof knowledgePackSchema>

export const aiAnalysisResultSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string().nullable(),
  transactionId: z.string().nullable(),
  rowIndex: z.number().nullable(),
  provider: z.string(),
  model: z.string().nullable(),
  promptVersion: z.string(),
  reasoning: z.string().nullable(),
  categoryCode: z.string().nullable(),
  projectCode: z.string().nullable(),
  suggestedStatus: z.string().nullable(),
  confidence: candidateConfidenceSchema,
  clarifyingQuestion: z.string().nullable(),
  tokensUsed: z.number().nullable(),
  createdAt: z.date(),
})
export type AiAnalysisResult = z.infer<typeof aiAnalysisResultSchema>

export const categorizationRuleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  matchType: z.string(),
  matchField: z.string(),
  matchValue: z.string(),
  categoryCode: z.string().nullable(),
  projectCode: z.string().nullable(),
  type: z.string().nullable(),
  status: z.string().nullable(),
  note: z.string().nullable(),
  priority: z.number(),
  source: z.string(),
  confidence: z.number(),
  isActive: z.boolean(),
  matchCount: z.number(),
  lastAppliedAt: z.date().nullable(),
  learnReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type CategorizationRule = z.infer<typeof categorizationRuleSchema>

export const appDataSchema = z.object({
  id: z.string(),
  app: z.string(),
  userId: z.string(),
  data: jsonValueSchema,
})

// ---------------------------------------------------------------------------
// Past Search result item
// ---------------------------------------------------------------------------

export const searchResultItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional().default(""),
  source: z.string().optional().default(""),
  publishedDate: z.string().nullable().optional().default(null),
})
export type SearchResultItem = z.infer<typeof searchResultItemSchema>

export const pastSearchSchema = z.object({
  id: z.string(),
  userId: z.string(),
  query: z.string(),
  topic: z.string(),
  results: z.array(searchResultItemSchema),
  resultCount: z.number(),
  createdAt: z.date(),
})
export type PastSearch = z.infer<typeof pastSearchSchema>

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
  pdfFileId: z.string().nullable(),
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

export const invoicePaymentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  invoiceId: z.string(),
  transactionId: z.string(),
  amountCents: z.number(),
  note: z.string().nullable(),
  source: z.string(),
  createdAt: z.date(),
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
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>
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
  status?: string | null
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
  status?: string | null
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

export interface PastSearchCreateInput {
  userId: string
  query: string
  topic: string
  results: SearchResultItem[]
}
