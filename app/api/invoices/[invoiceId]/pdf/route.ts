import { InvoicePDF } from "@/components/invoicing/invoice-pdf"
import { getCurrentUser } from "@/lib/auth"
import { getInvoiceById } from "@/models/invoices"
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  let user
  try {
    user = await getCurrentUser()
  } catch {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { invoiceId } = await params

  const invoice = await getInvoiceById(invoiceId, user.id)
  if (!invoice) {
    return new NextResponse("Not found", { status: 404 })
  }

  const businessName = user.businessName || ""
  const businessAddress = user.businessAddress || ""

  const pdf = createElement(InvoicePDF, { invoice, businessName, businessAddress })
  const buffer = await renderToBuffer(pdf as any)

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    },
  })
}
