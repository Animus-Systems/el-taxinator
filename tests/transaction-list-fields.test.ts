import { describe, expect, it } from "vitest"
import type { Field } from "@/lib/db-types"
import { getVisibleTransactionFields } from "@/lib/transaction-list-fields"

const baseField = (overrides: Partial<Field>): Field => ({
  id: "field-id",
  userId: "user-id",
  code: "name",
  name: { en: "Name", es: "Nombre" },
  type: "string",
  llmPrompt: null,
  options: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  isVisibleInList: true,
  isVisibleInAnalysis: true,
  isRequired: false,
  isExtra: false,
  ...overrides,
})

describe("getVisibleTransactionFields", () => {
  it("adds accountName as a visible built-in field when the persisted fields list does not include it", () => {
    const result = getVisibleTransactionFields([
      baseField({ code: "name" }),
      baseField({ code: "merchant", name: { en: "Merchant", es: "Comerciante" } }),
    ])

    expect(result.map((field) => field.code)).toEqual(["name", "merchant", "accountName"])
    expect(result.at(-1)).toMatchObject({
      code: "accountName",
      isVisibleInList: true,
      isExtra: false,
    })
  })

  it("does not duplicate accountName when it already exists in persisted fields", () => {
    const result = getVisibleTransactionFields([
      baseField({ code: "name" }),
      baseField({ code: "accountName", name: { en: "Account", es: "Cuenta" } }),
    ])

    expect(result.map((field) => field.code)).toEqual(["name", "accountName"])
  })
})
