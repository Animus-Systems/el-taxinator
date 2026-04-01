import { describe, expect, it, vi } from "vitest"

// Mock the database module before importing the model
vi.mock("@/lib/db", () => ({
  prisma: {},
}))

import { EXPORT_AND_IMPORT_FIELD_MAP } from "@/models/export_and_import"

describe("EXPORT_AND_IMPORT_FIELD_MAP structure", () => {
  it("contains expected fields", () => {
    const expectedFields = [
      "name",
      "description",
      "merchant",
      "total",
      "currencyCode",
      "convertedTotal",
      "convertedCurrencyCode",
      "type",
      "note",
      "categoryCode",
      "projectCode",
      "issuedAt",
    ]
    for (const field of expectedFields) {
      expect(EXPORT_AND_IMPORT_FIELD_MAP).toHaveProperty(field)
    }
  })

  it("each field has a code and type", () => {
    for (const [key, field] of Object.entries(EXPORT_AND_IMPORT_FIELD_MAP)) {
      expect(field.code).toBeDefined()
      expect(field.type).toBeDefined()
      expect(typeof field.code).toBe("string")
      expect(typeof field.type).toBe("string")
    }
  })

  it("field codes match their keys", () => {
    for (const [key, field] of Object.entries(EXPORT_AND_IMPORT_FIELD_MAP)) {
      expect(field.code).toBe(key)
    }
  })
})

describe("total field export/import transforms", () => {
  const totalField = EXPORT_AND_IMPORT_FIELD_MAP.total

  it("export converts cents to decimal", async () => {
    const result = await totalField.export!("user-1", 12345)
    expect(result).toBe(123.45)
  })

  it("export converts zero", async () => {
    const result = await totalField.export!("user-1", 0)
    expect(result).toBe(0)
  })

  it("import converts decimal string to cents", async () => {
    const result = await totalField.import!("user-1", "123.45")
    expect(result).toBe(12345)
  })

  it("import handles integer string", async () => {
    const result = await totalField.import!("user-1", "100")
    expect(result).toBe(10000)
  })

  it("import returns 0 for NaN", async () => {
    const result = await totalField.import!("user-1", "not-a-number")
    expect(result).toBe(0)
  })

  it("import handles empty string as 0", async () => {
    const result = await totalField.import!("user-1", "")
    expect(result).toBe(0)
  })
})

describe("convertedTotal field export/import transforms", () => {
  const field = EXPORT_AND_IMPORT_FIELD_MAP.convertedTotal

  it("export converts cents to decimal", async () => {
    const result = await field.export!("user-1", 5000)
    expect(result).toBe(50)
  })

  it("export returns null for null value", async () => {
    const result = await field.export!("user-1", null)
    expect(result).toBeNull()
  })

  it("export returns null for 0 value (falsy)", async () => {
    const result = await field.export!("user-1", 0)
    expect(result).toBeNull()
  })

  it("import converts decimal string to cents", async () => {
    const result = await field.import!("user-1", "75.50")
    expect(result).toBe(7550)
  })

  it("import returns 0 for NaN", async () => {
    const result = await field.import!("user-1", "invalid")
    expect(result).toBe(0)
  })
})

describe("type field export/import transforms", () => {
  const field = EXPORT_AND_IMPORT_FIELD_MAP.type

  it("export lowercases type", async () => {
    const result = await field.export!("user-1", "EXPENSE")
    expect(result).toBe("expense")
  })

  it("export returns empty string for null", async () => {
    const result = await field.export!("user-1", null)
    expect(result).toBe("")
  })

  it("import lowercases type", async () => {
    const result = await field.import!("user-1", "Income")
    expect(result).toBe("income")
  })
})

describe("issuedAt field export/import transforms", () => {
  const field = EXPORT_AND_IMPORT_FIELD_MAP.issuedAt

  it("export formats date as yyyy-MM-dd", async () => {
    const date = new Date(2026, 2, 15) // March 15, 2026
    const result = await field.export!("user-1", date)
    expect(result).toBe("2026-03-15")
  })

  it("export returns null for null date", async () => {
    const result = await field.export!("user-1", null)
    expect(result).toBeNull()
  })

  it("export returns null for invalid date", async () => {
    const result = await field.export!("user-1", new Date("invalid"))
    expect(result).toBeNull()
  })

  it("import parses date string", async () => {
    const result = await field.import!("user-1", "2026-03-15")
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).getFullYear()).toBe(2026)
  })
})

describe("simple string fields", () => {
  it("name field has type string", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.name.type).toBe("string")
  })

  it("description field has type string", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.description.type).toBe("string")
  })

  it("merchant field has type string", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.merchant.type).toBe("string")
  })

  it("currencyCode field has type string", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.currencyCode.type).toBe("string")
  })

  it("convertedCurrencyCode field has type string", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.convertedCurrencyCode.type).toBe("string")
  })

  it("note field has type string", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.note.type).toBe("string")
  })

  it("simple string fields have no export/import transforms", () => {
    expect(EXPORT_AND_IMPORT_FIELD_MAP.name.export).toBeUndefined()
    expect(EXPORT_AND_IMPORT_FIELD_MAP.name.import).toBeUndefined()
    expect(EXPORT_AND_IMPORT_FIELD_MAP.description.export).toBeUndefined()
    expect(EXPORT_AND_IMPORT_FIELD_MAP.merchant.export).toBeUndefined()
    expect(EXPORT_AND_IMPORT_FIELD_MAP.note.export).toBeUndefined()
  })
})
