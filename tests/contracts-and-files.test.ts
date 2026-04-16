import { invoiceFormSchema } from "@/forms/invoices"
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
