import { InvoicePDF } from "@/components/invoicing/invoice-pdf"
import { getCurrentUser } from "@/lib/auth"
import { getInvoiceById } from "@/models/invoices"
import { renderToBuffer } from "@react-pdf/renderer"
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

  const pdfDocument = InvoicePDF({ invoice, businessName, businessAddress }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(pdfDocument)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
    },
  })
}
