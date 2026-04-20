/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import type { PurchaseWithRelations } from "@/models/purchases"
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { format } from "date-fns"

export type LibroOptions = {
  year: number
  quarter?: number
  businessName?: string
  businessTaxId?: string
}

export async function renderLibroRecibidasPdfBuffer(
  purchases: PurchaseWithRelations[],
  options: LibroOptions,
): Promise<Buffer> {
  return renderToBuffer(<LibroPDF purchases={purchases} options={options} />)
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#6b7280", marginBottom: 16 },
  meta: { fontSize: 9, color: "#6b7280", marginBottom: 12 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    padding: "4 6",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  row: {
    flexDirection: "row",
    padding: "4 6",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  totalsRow: {
    flexDirection: "row",
    padding: "6 6",
    backgroundColor: "#fafafa",
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    fontFamily: "Helvetica-Bold",
  },
  colDate: { width: 60 },
  colNumber: { width: 90 },
  colSupplier: { flex: 1.8 },
  colTaxId: { width: 80 },
  colBase: { width: 70, textAlign: "right" },
  colVat: { width: 60, textAlign: "right" },
  colIrpf: { width: 60, textAlign: "right" },
  colTotal: { width: 75, textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "center",
  },
})

function formatEUR(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
}

function LibroPDF({
  purchases,
  options,
}: {
  purchases: PurchaseWithRelations[]
  options: LibroOptions
}) {
  let totalBase = 0
  let totalVat = 0
  let totalIrpf = 0
  let totalGrand = 0
  for (const p of purchases) {
    const { subtotal, vatTotal, total } = calcInvoiceTotals(p.items, p.totalCents)
    const irpf = subtotal * (p.irpfRate / 100)
    totalBase += subtotal
    totalVat += vatTotal
    totalIrpf += irpf
    totalGrand += total - irpf
  }

  const periodLabel = options.quarter
    ? `Q${options.quarter} ${options.year}`
    : `${options.year}`

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Libro de facturas recibidas</Text>
        <Text style={styles.subtitle}>
          {options.businessName ?? ""}
          {options.businessTaxId ? ` · NIF ${options.businessTaxId}` : ""}
        </Text>
        <Text style={styles.meta}>Periodo: {periodLabel}</Text>

        <View style={styles.tableHeader}>
          <Text style={styles.colDate}>Fecha</Text>
          <Text style={styles.colNumber}>Nº factura</Text>
          <Text style={styles.colSupplier}>Proveedor</Text>
          <Text style={styles.colTaxId}>NIF</Text>
          <Text style={styles.colBase}>Base</Text>
          <Text style={styles.colVat}>IVA/IGIC</Text>
          <Text style={styles.colIrpf}>IRPF</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>

        {purchases.map((p) => {
          const { subtotal, vatTotal, total } = calcInvoiceTotals(p.items, p.totalCents)
          const irpf = subtotal * (p.irpfRate / 100)
          return (
            <View key={p.id} style={styles.row} wrap={false}>
              <Text style={styles.colDate}>{format(p.issueDate, "yyyy-MM-dd")}</Text>
              <Text style={styles.colNumber}>{p.supplierInvoiceNumber}</Text>
              <Text style={styles.colSupplier}>{p.contact?.name ?? "—"}</Text>
              <Text style={styles.colTaxId}>{p.contact?.taxId ?? ""}</Text>
              <Text style={styles.colBase}>{formatEUR(subtotal)}</Text>
              <Text style={styles.colVat}>{formatEUR(vatTotal)}</Text>
              <Text style={styles.colIrpf}>{irpf > 0 ? `-${formatEUR(irpf)}` : ""}</Text>
              <Text style={styles.colTotal}>{formatEUR(total - irpf)}</Text>
            </View>
          )
        })}

        <View style={styles.totalsRow}>
          <Text style={styles.colDate}></Text>
          <Text style={styles.colNumber}></Text>
          <Text style={styles.colSupplier}>TOTAL</Text>
          <Text style={styles.colTaxId}></Text>
          <Text style={styles.colBase}>{formatEUR(totalBase)}</Text>
          <Text style={styles.colVat}>{formatEUR(totalVat)}</Text>
          <Text style={styles.colIrpf}>{totalIrpf > 0 ? `-${formatEUR(totalIrpf)}` : ""}</Text>
          <Text style={styles.colTotal}>{formatEUR(totalGrand)}</Text>
        </View>

        <Text style={styles.footer}>
          Generado por Taxinator — {purchases.length} facturas
        </Text>
      </Page>
    </Document>
  )
}
