
import { deleteTransactionAction, saveTransactionAction } from "@/actions/transactions"
import { ItemsDetectTool } from "@/components/agents/items-detect"
import ToolWindow from "@/components/agents/tool-window"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectProject } from "@/components/forms/select-project"
import { FormSelectType } from "@/components/forms/select-type"
import { FormInput, FormTextarea } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import type { TransactionData } from "@/models/transactions"
import type { Category, Currency, Field, Project, Transaction } from "@/lib/db-types"
import { format } from "date-fns"
import { Loader2, Save, Trash2 } from "lucide-react"
import { useRouter } from "@/lib/navigation"
import { startTransition, useActionState, useEffect, useMemo, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { getLocalizedValue } from "@/lib/i18n-db"

export default function TransactionEditForm({
  transaction,
  categories,
  projects,
  currencies,
  fields,
  settings,
  onDone,
}: {
  transaction: Transaction
  categories: Category[]
  projects: Project[]
  currencies: Currency[]
  fields: Field[]
  settings: Record<string, string>
  onDone?: () => void
}) {
  const router = useRouter()
  const t = useTranslations("transactions")
  const confirm = useConfirm()
  const locale = useLocale()
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteTransactionAction, null)
  const [saveState, saveAction, isSaving] = useActionState(saveTransactionAction, null)

  const extraFields = fields.filter((field) => field.isExtra)
  const [formData, setFormData] = useState({
    name: transaction.name || "",
    merchant: transaction.merchant || "",
    description: transaction.description || "",
    total: transaction.total ? transaction.total / 100 : 0.0,
    currencyCode: transaction.currencyCode || settings["default_currency"] || "",
    convertedTotal: transaction.convertedTotal ? transaction.convertedTotal / 100 : 0.0,
    convertedCurrencyCode: transaction.convertedCurrencyCode,
    type: transaction.type || "expense",
    categoryCode: transaction.categoryCode || settings["default_category"] || "",
    projectCode: transaction.projectCode || settings["default_project"] || "",
    issuedAt: transaction.issuedAt ? format(transaction.issuedAt, "yyyy-MM-dd") : "",
    note: transaction.note || "",
    items: transaction.items || [],
    ...extraFields.reduce(
      (acc, field) => {
        acc[field.code] = (transaction.extra as Record<string, unknown> | null)?.[field.code] || ""
        return acc
      },
      {} as Record<string, unknown>
    ),
  })

  const fieldMap = useMemo(() => {
    return fields.reduce(
      (acc, field) => {
        acc[field.code] = field
        return acc
      },
      {} as Record<string, Field>
    )
  }, [fields])

  const getField = (code: string): Field => {
    const field = fieldMap[code]
    if (!field) {
      throw new Error(`Field definition missing for code: ${code}`)
    }
    return field
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: t("confirmDeletePermanentTitle"),
      description: t("confirmDeletePermanent"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      await deleteAction(transaction.id)
      if (onDone) onDone()
      else router.back()
    })
  }

  useEffect(() => {
    if (saveState?.success) {
      if (onDone) onDone()
      else router.back()
    }
  }, [saveState, router, onDone])

  return (
    <form action={saveAction} className="space-y-4">
      <input type="hidden" name="transactionId" value={transaction.id} />

      <FormInput
        title={getLocalizedValue(getField("name").name, locale)}
        name="name"
        defaultValue={formData.name}
        isRequired={getField("name").isRequired}
      />

      <FormInput
        title={getLocalizedValue(getField("merchant").name, locale)}
        name="merchant"
        defaultValue={formData.merchant}
        isRequired={getField("merchant").isRequired}
      />

      <FormInput
        title={getLocalizedValue(getField("description").name, locale)}
        name="description"
        defaultValue={formData.description}
        isRequired={getField("description").isRequired}
      />

      <div className="flex flex-row gap-4">
        <FormInput
          title={getLocalizedValue(getField("total").name, locale)}
          type="number"
          step="0.01"
          name="total"
          defaultValue={formData.total.toFixed(2)}
          className="w-32"
          isRequired={getField("total").isRequired}
        />

        <FormSelectCurrency
          title={getLocalizedValue(getField("currencyCode").name, locale)}
          name="currencyCode"
          value={formData.currencyCode}
          onValueChange={(value) => {
            setFormData({ ...formData, currencyCode: value })
          }}
          currencies={currencies}
          isRequired={getField("currencyCode").isRequired}
        />

        <FormSelectType
          title={getLocalizedValue(getField("type").name, locale)}
          name="type"
          defaultValue={formData.type}
          isRequired={getField("type").isRequired}
        />
      </div>

      <div className="flex flex-row flex-grow gap-4">
        <FormInput
          title={getLocalizedValue(getField("issuedAt").name, locale)}
          type="date"
          name="issuedAt"
          defaultValue={formData.issuedAt}
          isRequired={getField("issuedAt").isRequired}
        />
        {formData.currencyCode !== settings["default_currency"] || formData.convertedTotal !== 0 ? (
          <>
            {formData.convertedTotal !== null && (
              <FormInput
                title={`Total converted to ${formData.convertedCurrencyCode || "UNKNOWN CURRENCY"}`}
                type="number"
                step="0.01"
                name="convertedTotal"
                defaultValue={formData.convertedTotal.toFixed(2)}
                isRequired={getField("convertedTotal").isRequired}
                className="max-w-36"
              />
            )}
            {(!formData.convertedCurrencyCode || formData.convertedCurrencyCode !== settings["default_currency"]) && (
              <FormSelectCurrency
                title={t("convertedTotal")}
                name="convertedCurrencyCode"
                defaultValue={formData.convertedCurrencyCode ?? settings["default_currency"] ?? ""}
                currencies={currencies}
                isRequired={getField("convertedCurrencyCode").isRequired}
              />
            )}
          </>
        ) : (
          <></>
        )}
      </div>

      <div className="flex flex-row gap-4">
        <FormSelectCategory
          title={getLocalizedValue(getField("categoryCode").name, locale)}
          categories={categories}
          name="categoryCode"
          defaultValue={formData.categoryCode}
          isRequired={getField("categoryCode").isRequired}
        />

        <FormSelectProject
          title={getLocalizedValue(getField("projectCode").name, locale)}
          projects={projects}
          name="projectCode"
          defaultValue={formData.projectCode}
          isRequired={getField("projectCode").isRequired}
        />
      </div>

      <FormTextarea
        title={getLocalizedValue(getField("note").name, locale)}
        name="note"
        defaultValue={formData.note}
        className="h-24"
        isRequired={getField("note").isRequired}
      />

      <div className="flex flex-wrap gap-4">
        {extraFields.map((field) => (
          <FormInput
            key={field.code}
            type="text"
            title={getLocalizedValue(field.name, locale)}
            name={field.code}
            defaultValue={(formData[field.code as keyof typeof formData] as string) || ""}
            isRequired={field.isRequired}
            className={field.type === "number" ? "max-w-36" : "max-w-full"}
          />
        ))}
      </div>

      {formData.items && Array.isArray(formData.items) && formData.items.length > 0 && (
        <ToolWindow title={t("detectedItems")}>
          <ItemsDetectTool data={formData as TransactionData} />
        </ToolWindow>
      )}

      <div className="flex justify-between space-x-4 pt-6">
        <Button type="button" onClick={handleDelete} variant="destructive" disabled={isDeleting}>
          <>
            <Trash2 className="h-4 w-4" />
            {isDeleting ? t("deleting") : t("delete")}
          </>
        </Button>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("saving")}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t("saveTransaction")}
            </>
          )}
        </Button>
      </div>

      <div>
        {deleteState?.error && <FormError>{deleteState.error}</FormError>}
        {saveState?.error && <FormError>{saveState.error}</FormError>}
      </div>
    </form>
  )
}
