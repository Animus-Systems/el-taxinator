import { describe, it, expect } from "vitest"
import { contentDispositionHeader } from "@/lib/files"

describe("contentDispositionHeader", () => {
  it("encodes an ASCII filename with a quoted fallback", () => {
    expect(contentDispositionHeader("attachment", "invoice.pdf")).toBe(
      `attachment; filename="invoice.pdf"; filename*=UTF-8''invoice.pdf`,
    )
  })

  it("percent-encodes non-ASCII filenames in filename*", () => {
    const h = contentDispositionHeader("inline", "factura-€.pdf")
    expect(h).toMatch(/^inline; filename="factura-_\.pdf"; filename\*=UTF-8''/)
    expect(h).toContain("%E2%82%AC")
  })

  it("strips quotes and backslashes from the ASCII fallback", () => {
    expect(contentDispositionHeader("attachment", `a"b\\c.pdf`)).toContain(
      `filename="a_b_c.pdf"`,
    )
  })
})
