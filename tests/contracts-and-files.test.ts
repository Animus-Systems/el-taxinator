import { invoiceFormSchema } from "@/forms/invoices"
import { timeEntryFormSchema } from "@/forms/time"
import { safePathJoin } from "@/lib/files"
import { describe, expect, it } from "vitest"

describe("safePathJoin", () => {
  it("keeps paths inside the base directory", () => {
    const result = safePathJoin("/tmp/uploads", "2026", "03", "invoice.pdf")

    expect(result).toBe("/tmp/uploads/2026/03/invoice.pdf")
  })

  it("rejects path traversal attempts", () => {
    expect(() => safePathJoin("/tmp/uploads", "../secrets.txt")).toThrow("Path traversal detected")
  })
})

describe("invoiceFormSchema", () => {
  it("parses string dates into Date instances", () => {
    const parsed = invoiceFormSchema.parse({
      clientId: null,
      number: "INV-2026-001",
      status: "draft",
      issueDate: "2026-03-30",
      dueDate: "2026-04-15",
      notes: "Quarterly retainers",
      irpfRate: "15",
      items: [
        {
          productId: null,
          description: "Advisory work",
          quantity: 2,
          unitPrice: 12500,
          vatRate: 21,
        },
      ],
    })

    expect(parsed.issueDate).toBeInstanceOf(Date)
    expect(parsed.dueDate).toBeInstanceOf(Date)
    expect(parsed.irpfRate).toBe(15)
  })

  it("requires at least one line item", () => {
    expect(() =>
      invoiceFormSchema.parse({
        clientId: null,
        number: "INV-2026-002",
        status: "draft",
        issueDate: "2026-03-30",
        items: [],
      })
    ).toThrow()
  })
})

describe("timeEntryFormSchema", () => {
  it("normalizes string form input into typed server values", () => {
    const parsed = timeEntryFormSchema.parse({
      description: "Client workshop",
      projectCode: "freelance",
      clientId: "client-123",
      startedAt: "2026-03-30T09:00:00.000Z",
      endedAt: "2026-03-30T11:30:00.000Z",
      durationMinutes: "150",
      hourlyRate: "80.50",
      currencyCode: "EUR",
      isBillable: "on",
      notes: "",
    })

    expect(parsed.startedAt).toBeInstanceOf(Date)
    expect(parsed.endedAt).toBeInstanceOf(Date)
    expect(parsed.durationMinutes).toBe(150)
    expect(parsed.hourlyRate).toBe(8050)
    expect(parsed.isBillable).toBe(true)
    expect(parsed.notes).toBeNull()
  })

  it("accepts blank optional values as null", () => {
    const parsed = timeEntryFormSchema.parse({
      description: "",
      projectCode: "",
      clientId: "",
      startedAt: "2026-03-30T09:00:00.000Z",
      endedAt: "",
      durationMinutes: "",
      hourlyRate: "",
      currencyCode: "",
      isBillable: "false",
      notes: "",
    })

    expect(parsed.description).toBeNull()
    expect(parsed.projectCode).toBeNull()
    expect(parsed.clientId).toBeNull()
    expect(parsed.endedAt).toBeNull()
    expect(parsed.durationMinutes).toBeNull()
    expect(parsed.hourlyRate).toBeNull()
    expect(parsed.currencyCode).toBeNull()
    expect(parsed.isBillable).toBe(false)
  })
})
