import { calcInvoiceTotals } from "@/models/invoices"
import { Client, Invoice, InvoiceItem, Product, Quote } from "@/prisma/client"
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { format } from "date-fns"

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  businessName: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#4f46e5" },
  invoiceNumber: { fontSize: 12, color: "#6b7280" },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 9, color: "#9ca3af", marginBottom: 2, textTransform: "uppercase" },
  sectionValue: { fontSize: 11 },
  table: { marginTop: 24, marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    padding: "6 8",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: { flexDirection: "row", padding: "6 8", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.5, textAlign: "right" },
  colVat: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  totalsLabel: { width: 100, textAlign: "right", color: "#6b7280" },
  totalsValue: { width: 100, textAlign: "right" },
  grandTotalLabel: { width: 100, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 12 },
  grandTotalValue: { width: 100, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 12, color: "#4f46e5" },
  notes: { marginTop: 24, padding: 12, backgroundColor: "#f9fafb", fontSize: 9, color: "#6b7280" },
  footer: { position: "absolute", bottom: 32, left: 48, right: 48, fontSize: 8, color: "#9ca3af", textAlign: "center" },
})

type InvoiceWithRelations = Invoice & {
  client: Client | null
  items: (InvoiceItem & { product: Product | null })[]
  quote: Quote | null
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

type Props = {
  invoice: InvoiceWithRelations
  businessName?: string
  businessAddress?: string
  businessTaxId?: string // optional, for future use
}

export function InvoicePDF({ invoice, businessName, businessAddress, businessTaxId }: Props) {
  const { subtotal, vatTotal, total } = calcInvoiceTotals(invoice.items)

  return (
    <Document title={`Invoice ${invoice.number}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{businessName || "Your Business"}</Text>
            {businessAddress && <Text style={{ color: "#6b7280" }}>{businessAddress}</Text>}
            {businessTaxId && <Text style={{ color: "#6b7280" }}>NIF: {businessTaxId}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
          </View>
        </View>

        {/* Dates & client */}
        <View style={{ flexDirection: "row", marginBottom: 24, gap: 32 }}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={[styles.sectionValue, { fontFamily: "Helvetica-Bold" }]}>{invoice.client?.name || "—"}</Text>
            {invoice.client?.taxId && <Text style={{ color: "#6b7280" }}>NIF: {invoice.client.taxId}</Text>}
            {invoice.client?.address && <Text>{invoice.client.address}</Text>}
            {invoice.client?.email && <Text style={{ color: "#6b7280" }}>{invoice.client.email}</Text>}
          </View>
          <View style={[styles.section, { marginLeft: "auto" }]}>
            <View style={{ flexDirection: "row", gap: 16, marginBottom: 4 }}>
              <View>
                <Text style={styles.sectionLabel}>Issue Date</Text>
                <Text style={styles.sectionValue}>{format(invoice.issueDate, "dd/MM/yyyy")}</Text>
              </View>
              {invoice.dueDate && (
                <View>
                  <Text style={styles.sectionLabel}>Due Date</Text>
                  <Text style={styles.sectionValue}>{format(invoice.dueDate, "dd/MM/yyyy")}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit Price</Text>
            <Text style={styles.colVat}>VAT %</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {invoice.items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{formatEUR(item.unitPrice)}</Text>
              <Text style={styles.colVat}>{item.vatRate}%</Text>
              <Text style={styles.colTotal}>{formatEUR(item.quantity * item.unitPrice)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatEUR(subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>IVA</Text>
            <Text style={styles.totalsValue}>{formatEUR(vatTotal)}</Text>
          </View>
          {invoice.irpfRate > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Ret. IRPF ({invoice.irpfRate}%)</Text>
              <Text style={styles.totalsValue}>−{formatEUR(Math.round(subtotal * invoice.irpfRate / 100))}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, { marginTop: 6 }]}>
            <Text style={styles.grandTotalLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.grandTotalValue}>
              {formatEUR(total - (invoice.irpfRate > 0 ? Math.round(subtotal * invoice.irpfRate / 100) : 0))}
            </Text>
          </View>
        </View>

        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          {businessName} — Invoice {invoice.number} — Generated {format(new Date(), "dd/MM/yyyy")}
        </Text>
      </Page>
    </Document>
  )
}
