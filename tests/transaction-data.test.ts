import { describe, expect, it } from "vitest"
import type { Field } from "@/lib/db-types"
import { splitTransactionDataByFieldDefinitions } from "@/lib/transaction-data"

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

describe("splitTransactionDataByFieldDefinitions", () => {
  it("keeps built-in transaction properties even when they are not present in the fields table", () => {
    const result = splitTransactionDataByFieldDefinitions(
      {
        name: "Invoice import",
        accountId: "acc-123",
        issuedAt: "2026-04-01",
        items: [{ name: "Line item" }],
        files: ["file-1"],
        deductible: true,
      },
      [baseField({ code: "name" })],
    )

    expect(result.standard).toMatchObject({
      name: "Invoice import",
      accountId: "acc-123",
      issuedAt: "2026-04-01",
      items: [{ name: "Line item" }],
      files: ["file-1"],
      deductible: true,
    })
    expect(result.extra).toEqual({})
  })

  it("moves custom extra fields into the extra payload and preserves nested extra input", () => {
    const result = splitTransactionDataByFieldDefinitions(
      {
        accountId: "acc-123",
        vat: 12.5,
        extra: { importedFrom: "csv" },
      },
      [baseField({ code: "vat", isExtra: true, type: "number" })],
    )

    expect(result.standard).toMatchObject({
      accountId: "acc-123",
    })
    expect(result.extra).toEqual({
      vat: 12.5,
      importedFrom: "csv",
    })
  })
})
