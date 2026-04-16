import { describe, expect, it } from "vitest"
import { transactionFormSchema } from "@/forms/transactions"
import { clientFormSchema } from "@/forms/clients"
import { productFormSchema } from "@/forms/products"
import { invoiceFormSchema, quoteFormSchema } from "@/forms/invoices"
import { settingsFormSchema, currencyFormSchema, projectFormSchema, categoryFormSchema, fieldFormSchema } from "@/forms/settings"
import { accountantCommentSchema } from "@/forms/accountant"

describe("transactionFormSchema", () => {
  it("parses valid transaction data", () => {
    const result = transactionFormSchema.parse({
      name: "Office supplies",
      merchant: "Staples",
      total: "49.99",
      currencyCode: "EUR",
      type: "expense",
    })
    expect(result.name).toBe("Office supplies")
    expect(result.total).toBe(4999) // converted to cents
  })

  it("converts total from string to cents", () => {
    const result = transactionFormSchema.parse({ total: "100.50" })
    expect(result.total).toBe(10050)
  })

  it("converts convertedTotal from string to cents", () => {
    const result = transactionFormSchema.parse({ convertedTotal: "200.75" })
    expect(result.convertedTotal).toBe(20075)
  })

  it("handles empty total as null", () => {
    const result = transactionFormSchema.parse({ total: "" })
    expect(result.total).toBeNull()
  })

  it("handles empty convertedTotal as null", () => {
    const result = transactionFormSchema.parse({ convertedTotal: "" })
    expect(result.convertedTotal).toBeNull()
  })

  it("parses date string into Date for issuedAt", () => {
    const result = transactionFormSchema.parse({ issuedAt: "2026-03-15" })
    expect(result.issuedAt).toBeInstanceOf(Date)
  })

  it("accepts Date object for issuedAt", () => {
    const date = new Date(2026, 2, 15)
    const result = transactionFormSchema.parse({ issuedAt: date })
    expect(result.issuedAt).toBeInstanceOf(Date)
  })

  it("rejects invalid date string for issuedAt", () => {
    expect(() =>
      transactionFormSchema.parse({ issuedAt: "not-a-date" })
    ).toThrow()
  })

  it("parses items JSON string", () => {
    const items = JSON.stringify([{ name: "Item 1", price: 100 }])
    const result = transactionFormSchema.parse({ items })
    expect(result.items).toEqual([{ name: "Item 1", price: 100 }])
  })

  it("handles empty items as empty array", () => {
    const result = transactionFormSchema.parse({ items: "" })
    expect(result.items).toEqual([])
  })

  it("rejects invalid items JSON", () => {
    expect(() =>
      transactionFormSchema.parse({ items: "not-json{" })
    ).toThrow()
  })

  it("rejects invalid total", () => {
    expect(() =>
      transactionFormSchema.parse({ total: "abc" })
    ).toThrow()
  })

  it("allows extra string fields via catchall", () => {
    const result = transactionFormSchema.parse({
      name: "Test",
      customField: "custom-value",
    })
    expect((result as Record<string, unknown>)["customField"]).toBe("custom-value")
  })
})

describe("clientFormSchema", () => {
  it("parses valid client data", () => {
    const result = clientFormSchema.parse({
      name: "Acme Corp",
      email: "contact@acme.com",
      phone: "+34 600 000 000",
      taxId: "B12345678",
    })
    expect(result.name).toBe("Acme Corp")
    expect(result.email).toBe("contact@acme.com")
  })

  it("requires name (min 1 char)", () => {
    expect(() =>
      clientFormSchema.parse({ name: "" })
    ).toThrow()
  })

  it("rejects name over 256 chars", () => {
    expect(() =>
      clientFormSchema.parse({ name: "a".repeat(257) })
    ).toThrow()
  })

  it("allows empty string for email", () => {
    const result = clientFormSchema.parse({ name: "Test", email: "" })
    expect(result.email).toBe("")
  })

  it("validates email format", () => {
    expect(() =>
      clientFormSchema.parse({ name: "Test", email: "not-an-email" })
    ).toThrow()
  })

  it("allows optional fields to be omitted", () => {
    const result = clientFormSchema.parse({ name: "Minimal Client" })
    expect(result.phone).toBeUndefined()
    expect(result.address).toBeUndefined()
    expect(result.taxId).toBeUndefined()
    expect(result.notes).toBeUndefined()
  })
})

describe("productFormSchema", () => {
  it("parses valid product data", () => {
    const result = productFormSchema.parse({
      name: "Consulting Hour",
      price: "75.00",
      vatRate: "21",
      unit: "hour",
    })
    expect(result.name).toBe("Consulting Hour")
    expect(result.price).toBe(7500) // cents
    expect(result.vatRate).toBe(21)
  })

  it("converts price from string to cents", () => {
    const result = productFormSchema.parse({ name: "Item", price: "49.99", vatRate: "21" })
    expect(result.price).toBe(4999)
  })

  it("defaults currency to EUR", () => {
    const result = productFormSchema.parse({ name: "Item", price: "10", vatRate: "21" })
    expect(result.currencyCode).toBe("EUR")
  })

  it("requires name (min 1 char)", () => {
    expect(() =>
      productFormSchema.parse({ name: "", price: "10" })
    ).toThrow()
  })

  it("defaults vatRate to 21 when empty", () => {
    const result = productFormSchema.parse({ name: "Item", price: "10", vatRate: "" })
    expect(result.vatRate).toBe(21)
  })
})

describe("invoiceFormSchema", () => {
  const validInvoice = {
    number: "INV-001",
    status: "draft",
    issueDate: "2026-03-30",
    items: [
      {
        description: "Work done",
        quantity: 1,
        unitPrice: 10000,
        vatRate: 21,
      },
    ],
  }

  it("parses valid invoice data", () => {
    const result = invoiceFormSchema.parse(validInvoice)
    expect(result.number).toBe("INV-001")
    expect(result.issueDate).toBeInstanceOf(Date)
    expect(result.items).toHaveLength(1)
  })

  it("requires at least one line item", () => {
    expect(() =>
      invoiceFormSchema.parse({ ...validInvoice, items: [] })
    ).toThrow()
  })

  it("requires invoice number", () => {
    expect(() =>
      invoiceFormSchema.parse({ ...validInvoice, number: "" })
    ).toThrow()
  })

  it("defaults status to draft", () => {
    const result = invoiceFormSchema.parse({
      number: "INV-002",
      issueDate: "2026-04-01",
      items: validInvoice.items,
    })
    expect(result.status).toBe("draft")
  })

  it("validates status enum", () => {
    expect(() =>
      invoiceFormSchema.parse({ ...validInvoice, status: "invalid" })
    ).toThrow()
  })

  it("accepts all valid statuses", () => {
    for (const status of ["draft", "sent", "paid", "overdue", "cancelled"]) {
      const result = invoiceFormSchema.parse({ ...validInvoice, status })
      expect(result.status).toBe(status)
    }
  })

  it("parses irpfRate from string", () => {
    const result = invoiceFormSchema.parse({ ...validInvoice, irpfRate: "15" })
    expect(result.irpfRate).toBe(15)
  })

  it("defaults irpfRate to 0", () => {
    const result = invoiceFormSchema.parse(validInvoice)
    expect(result.irpfRate).toBe(0)
  })

  it("allows nullable clientId", () => {
    const result = invoiceFormSchema.parse({ ...validInvoice, clientId: null })
    expect(result.clientId).toBeNull()
  })

  it("allows nullable dueDate", () => {
    const result = invoiceFormSchema.parse({ ...validInvoice, dueDate: null })
    expect(result.dueDate).toBeNull()
  })
})

describe("quoteFormSchema", () => {
  const validQuote = {
    number: "QUO-001",
    status: "draft",
    issueDate: "2026-03-30",
    items: [
      {
        description: "Proposal",
        quantity: 1,
        unitPrice: 5000,
        vatRate: 21,
      },
    ],
  }

  it("parses valid quote data", () => {
    const result = quoteFormSchema.parse(validQuote)
    expect(result.number).toBe("QUO-001")
    expect(result.items).toHaveLength(1)
  })

  it("accepts quote-specific statuses", () => {
    for (const status of ["draft", "sent", "accepted", "rejected", "converted"]) {
      const result = quoteFormSchema.parse({ ...validQuote, status })
      expect(result.status).toBe(status)
    }
  })

  it("requires at least one item", () => {
    expect(() =>
      quoteFormSchema.parse({ ...validQuote, items: [] })
    ).toThrow()
  })

  it("allows nullable expiryDate", () => {
    const result = quoteFormSchema.parse({ ...validQuote, expiryDate: null })
    expect(result.expiryDate).toBeNull()
  })
})

describe("settingsFormSchema", () => {
  it("parses valid settings data", () => {
    const result = settingsFormSchema.parse({
      default_currency: "EUR",
      openai_api_key: "sk-test",
      openai_model_name: "gpt-4o",
    })
    expect(result.default_currency).toBe("EUR")
    expect(result.openai_api_key).toBe("sk-test")
  })

  it("provides defaults for model names", () => {
    const result = settingsFormSchema.parse({})
    expect(result.openai_model_name).toBe("gpt-4o-mini")
    expect(result.google_model_name).toBe("gemini-2.5-flash")
    expect(result.mistral_model_name).toBe("mistral-medium-latest")
    expect(result.anthropic_model_name).toBe("claude-sonnet-4-6")
  })

  it("defaults llm_primary_provider to anthropic", () => {
    const result = settingsFormSchema.parse({})
    expect(result.llm_primary_provider).toBe("anthropic")
  })

  it("defaults llm_backup_provider to google", () => {
    const result = settingsFormSchema.parse({})
    expect(result.llm_backup_provider).toBe("google")
  })
})

describe("currencyFormSchema", () => {
  it("parses valid currency data", () => {
    const result = currencyFormSchema.parse({ code: "EUR", name: "Euro" })
    expect(result.code).toBe("EUR")
    expect(result.name).toBe("Euro")
  })

  it("rejects code over 5 chars", () => {
    expect(() =>
      currencyFormSchema.parse({ code: "TOOLONG", name: "Test" })
    ).toThrow()
  })

  it("rejects name over 32 chars", () => {
    expect(() =>
      currencyFormSchema.parse({ code: "TST", name: "a".repeat(33) })
    ).toThrow()
  })
})

describe("projectFormSchema", () => {
  it("parses valid project data", () => {
    const result = projectFormSchema.parse({ name: "My Project" })
    expect(result.name).toBe("My Project")
  })

  it("rejects name over 128 chars", () => {
    expect(() =>
      projectFormSchema.parse({ name: "a".repeat(129) })
    ).toThrow()
  })

  it("allows nullable llmPrompt", () => {
    const result = projectFormSchema.parse({ name: "P", llmPrompt: null })
    expect(result.llmPrompt).toBeNull()
  })
})

describe("categoryFormSchema", () => {
  it("parses valid category data", () => {
    const result = categoryFormSchema.parse({ name: "Expenses" })
    expect(result.name).toBe("Expenses")
  })

  it("rejects name over 128 chars", () => {
    expect(() =>
      categoryFormSchema.parse({ name: "a".repeat(129) })
    ).toThrow()
  })
})

describe("fieldFormSchema", () => {
  it("parses valid field data", () => {
    const result = fieldFormSchema.parse({ name: "Tax Rate" })
    expect(result.name).toBe("Tax Rate")
    expect(result.type).toBe("string") // default
  })

  it("defaults type to string", () => {
    const result = fieldFormSchema.parse({ name: "Custom" })
    expect(result.type).toBe("string")
  })

  it("accepts boolean visibility flags", () => {
    const result = fieldFormSchema.parse({
      name: "Custom",
      isVisibleInList: true,
      isVisibleInAnalysis: false,
      isRequired: true,
    })
    expect(result.isVisibleInList).toBe(true)
    expect(result.isVisibleInAnalysis).toBe(false)
    expect(result.isRequired).toBe(true)
  })
})

describe("accountantCommentSchema", () => {
  it("parses valid comment data", () => {
    const result = accountantCommentSchema.parse({
      entityType: "transaction",
      entityId: "abc-123",
      body: "Looks good, approved.",
    })
    expect(result.entityType).toBe("transaction")
    expect(result.body).toBe("Looks good, approved.")
  })

  it("requires non-empty body", () => {
    expect(() =>
      accountantCommentSchema.parse({
        entityType: "transaction",
        entityId: "abc-123",
        body: "",
      })
    ).toThrow()
  })

  it("trims whitespace from body", () => {
    const result = accountantCommentSchema.parse({
      entityType: "transaction",
      entityId: "abc-123",
      body: "  Note with spaces  ",
    })
    expect(result.body).toBe("Note with spaces")
  })

  it("rejects body over 2000 chars", () => {
    expect(() =>
      accountantCommentSchema.parse({
        entityType: "transaction",
        entityId: "abc-123",
        body: "a".repeat(2001),
      })
    ).toThrow()
  })

  it("requires entityType", () => {
    expect(() =>
      accountantCommentSchema.parse({
        entityType: "",
        entityId: "abc-123",
        body: "test",
      })
    ).toThrow()
  })

  it("requires entityId", () => {
    expect(() =>
      accountantCommentSchema.parse({
        entityType: "transaction",
        entityId: "",
        body: "test",
      })
    ).toThrow()
  })
})
