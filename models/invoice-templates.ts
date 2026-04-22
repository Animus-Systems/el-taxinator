import {
  sql,
  queryOne,
  queryMany,
  buildInsert,
  buildUpdate,
  withTransaction,
  mapRow,
} from "@/lib/sql"
import type {
  InvoiceTemplate,
  InvoiceTemplateLabels,
  LogoPosition,
  FontPreset,
  TemplateLanguage,
} from "@/lib/db-types"

export type InvoiceTemplateData = {
  name: string
  isDefault?: boolean
  logoFileId?: string | null
  logoPosition?: LogoPosition
  accentColor?: string
  fontPreset?: FontPreset
  headerText?: string | null
  footerText?: string | null
  bankDetailsText?: string | null
  businessDetailsText?: string | null
  belowTotalsText?: string | null
  showProminentTotal?: boolean
  showVatColumn?: boolean
  labels?: InvoiceTemplateLabels | null
  showBankDetails?: boolean
  paymentTermsDays?: number | null
  language?: TemplateLanguage
}

export async function listTemplates(userId: string): Promise<InvoiceTemplate[]> {
  return queryMany<InvoiceTemplate>(sql`
    SELECT * FROM invoice_templates
    WHERE user_id = ${userId}
    ORDER BY name ASC
    LIMIT 200`)
}

export async function getTemplateById(
  id: string,
  userId: string,
): Promise<InvoiceTemplate | null> {
  return queryOne<InvoiceTemplate>(sql`
    SELECT * FROM invoice_templates
    WHERE id = ${id} AND user_id = ${userId}`)
}

export async function getDefaultTemplate(userId: string): Promise<InvoiceTemplate | null> {
  return queryOne<InvoiceTemplate>(sql`
    SELECT * FROM invoice_templates
    WHERE user_id = ${userId} AND is_default = true
    LIMIT 1`)
}

export async function createTemplate(
  userId: string,
  data: InvoiceTemplateData,
): Promise<InvoiceTemplate> {
  return withTransaction(async (tx) => {
    // If the caller asked for this to become the default, clear any existing
    // default first so the partial unique index never sees two trues at once.
    if (data.isDefault) {
      await tx.query(
        `UPDATE invoice_templates SET is_default = false, updated_at = now()
         WHERE user_id = $1 AND is_default = true`,
        [userId],
      )
    }
    const insert = buildInsert("invoice_templates", { ...data, userId })
    const result = await tx.query(insert.text, insert.values)
    const row = result.rows[0]
    if (!row) throw new Error("Expected row from insert invoice_templates")
    // mapRow lives on lib/sql; template fields all use standard snake→camel
    // mapping so the existing mapRow handles them without custom conversion.
    return mapRow<InvoiceTemplate>(row)
  })
}

export async function updateTemplate(
  id: string,
  userId: string,
  data: InvoiceTemplateData,
): Promise<InvoiceTemplate | null> {
  return withTransaction(async (tx) => {
    if (data.isDefault) {
      await tx.query(
        `UPDATE invoice_templates SET is_default = false, updated_at = now()
         WHERE user_id = $1 AND is_default = true AND id <> $2`,
        [userId, id],
      )
    }
    const update = buildUpdate(
      "invoice_templates",
      { ...data, updatedAt: new Date() },
      "id = $1 AND user_id = $2",
      [id, userId],
    )
    const result = await tx.query(update.text, update.values)
    const row = result.rows[0]
    if (!row) return null
    return mapRow<InvoiceTemplate>(row)
  })
}

export async function deleteTemplate(
  id: string,
  userId: string,
): Promise<InvoiceTemplate | null> {
  return queryOne<InvoiceTemplate>(sql`
    DELETE FROM invoice_templates
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *`)
}

/**
 * Clone an existing template as a new row. The copy is never marked as
 * default (even if the source was) so the original's default status is
 * preserved. Name gets " (copy)" appended so the user can tell them apart
 * in the list before renaming.
 */
export async function duplicateTemplate(
  id: string,
  userId: string,
): Promise<InvoiceTemplate | null> {
  const source = await getTemplateById(id, userId)
  if (!source) return null
  return createTemplate(userId, {
    name: `${source.name} (copy)`,
    isDefault: false,
    logoFileId: source.logoFileId,
    logoPosition: source.logoPosition,
    accentColor: source.accentColor,
    fontPreset: source.fontPreset,
    headerText: source.headerText,
    footerText: source.footerText,
    bankDetailsText: source.bankDetailsText,
    businessDetailsText: source.businessDetailsText,
    belowTotalsText: source.belowTotalsText,
    showProminentTotal: source.showProminentTotal,
    showVatColumn: source.showVatColumn,
    labels: source.labels,
    showBankDetails: source.showBankDetails,
    paymentTermsDays: source.paymentTermsDays,
    language: source.language,
  })
}

/**
 * Make `id` the user's default template. Uses a transaction so the partial
 * unique index (one default per user) never sees two true rows at once.
 */
export async function setDefaultTemplate(
  id: string,
  userId: string,
): Promise<InvoiceTemplate | null> {
  return withTransaction(async (tx) => {
    await tx.query(
      `UPDATE invoice_templates SET is_default = false, updated_at = now()
       WHERE user_id = $1 AND is_default = true`,
      [userId],
    )
    const result = await tx.query(
      `UPDATE invoice_templates SET is_default = true, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId],
    )
    const row = result.rows[0]
    if (!row) return null
    return mapRow<InvoiceTemplate>(row)
  })
}
