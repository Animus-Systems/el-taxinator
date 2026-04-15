import type { Field } from "@/lib/db-types"

const BUILT_IN_ACCOUNT_NAME_FIELD: Field = {
  id: "__built_in_account_name__",
  userId: "",
  code: "accountName",
  name: { en: "Account", es: "Cuenta" },
  type: "string",
  llmPrompt: null,
  options: null,
  createdAt: new Date(0),
  isVisibleInList: true,
  isVisibleInAnalysis: false,
  isRequired: false,
  isExtra: false,
}

export function getVisibleTransactionFields(fields: Field[]): Field[] {
  const visibleFields = fields.filter((field) => field.isVisibleInList)
  const hasPersistedAccountField = fields.some((field) => field.code === "accountName")

  if (hasPersistedAccountField) {
    return visibleFields
  }

  return [...visibleFields, BUILT_IN_ACCOUNT_NAME_FIELD]
}
