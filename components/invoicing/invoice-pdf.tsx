/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import type { InvoiceWithRelations } from "@/models/invoices"
import type {
  InvoiceTemplate,
  InvoiceTemplateLabels,
  FontPreset,
  LogoPosition,
} from "@/lib/db-types"
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { format } from "date-fns"

/**
 * Render an invoice to a PDF Buffer. Kept in the .tsx file so the JSX
 * flows naturally; server code calls this to get bytes it can persist.
 */
export async function renderInvoicePdfBuffer(
  invoice: InvoiceWithRelations,
  options?: {
    businessName?: string
    businessAddress?: string
    businessTaxId?: string
    template?: InvoiceTemplate | null
    /** Raw logo bytes. Caller loads them from disk so the PDF renderer
     *  never touches the filesystem. */
    logoBytes?: Buffer | null
  },
): Promise<Buffer> {
  return renderToBuffer(
    <InvoicePDF
      invoice={invoice}
      {...(options?.businessName !== undefined && { businessName: options.businessName })}
      {...(options?.businessAddress !== undefined && { businessAddress: options.businessAddress })}
      {...(options?.businessTaxId !== undefined && { businessTaxId: options.businessTaxId })}
      {...(options?.template !== undefined && { template: options.template })}
      {...(options?.logoBytes !== undefined && { logoBytes: options.logoBytes })}
    />,
  )
}

function fontFamilyFor(preset: FontPreset, weight: "regular" | "bold" | "italic"): string {
  if (preset === "times") {
    if (weight === "bold") return "Times-Bold"
    if (weight === "italic") return "Times-Italic"
    return "Times-Roman"
  }
  if (preset === "courier") {
    if (weight === "bold") return "Courier-Bold"
    if (weight === "italic") return "Courier-Oblique"
    return "Courier"
  }
  if (weight === "bold") return "Helvetica-Bold"
  if (weight === "italic") return "Helvetica-Oblique"
  return "Helvetica"
}

const DEFAULT_ACCENT = "#4f46e5"
const DEFAULT_FONT: FontPreset = "helvetica"
const DEFAULT_LOGO_POSITION: LogoPosition = "left"

type LabelSet = {
  invoiceTitle: string
  issueDate: string
  dueDate: string
  billTo: string
  description: string
  qty: string
  unitPrice: string
  vatPercent: string
  amount: string
  subtotal: string
  vat: string
  irpfRetention: string
  totalToPay: string
  prominentTotal: string
  notes: string
  bankDetails: string
  generated: string
  watermarkDraft: string
  watermarkCancelled: string
  watermarkRejected: string
}

const LABELS_EN: LabelSet = {
  invoiceTitle: "INVOICE",
  issueDate: "Issue Date",
  dueDate: "Due Date",
  billTo: "Bill To",
  description: "Description",
  qty: "Qty",
  unitPrice: "Unit Price",
  vatPercent: "VAT %",
  amount: "Amount",
  subtotal: "Subtotal",
  vat: "VAT",
  irpfRetention: "IRPF withholding",
  totalToPay: "TOTAL",
  prominentTotal: "Total",
  notes: "Notes",
  bankDetails: "Bank details",
  generated: "Generated",
  watermarkDraft: "DRAFT",
  watermarkCancelled: "CANCELLED",
  watermarkRejected: "REJECTED",
}

const LABELS_ES: LabelSet = {
  invoiceTitle: "FACTURA",
  issueDate: "Fecha",
  dueDate: "Vencimiento",
  billTo: "Facturado a",
  description: "Concepto",
  qty: "Unidades",
  unitPrice: "Precio",
  vatPercent: "IVA %",
  amount: "Importe",
  subtotal: "Base imponible",
  vat: "IVA",
  irpfRetention: "Ret. IRPF",
  totalToPay: "TOTAL",
  prominentTotal: "Total",
  notes: "Notas",
  bankDetails: "Datos bancarios",
  generated: "Generado",
  watermarkDraft: "BORRADOR",
  watermarkCancelled: "ANULADA",
  watermarkRejected: "RECHAZADA",
}

/** Fallback label set used when the template or caller supplies no
 *  override. `en` is the safe default — templates without an explicit
 *  language fall here. */
function defaultLabelsForLanguage(language: string | null | undefined): LabelSet {
  if (language === "es") return LABELS_ES
  return LABELS_EN
}

/**
 * Status values that warrant a "this isn't the real thing" watermark so the
 * recipient doesn't mistake a preview/in-progress document for a committed
 * one. Everything else ("sent", "paid", "accepted", "overdue") renders
 * clean.
 */
function watermarkLabelKey(
  status: string,
): keyof LabelSet | null {
  if (status === "draft") return "watermarkDraft"
  if (status === "cancelled") return "watermarkCancelled"
  if (status === "rejected") return "watermarkRejected"
  return null
}

function labelFor(
  key: keyof LabelSet,
  labels: InvoiceTemplateLabels | null | undefined,
  defaults: LabelSet,
  override?: Partial<LabelSet>,
): string {
  const fromOverride = override?.[key]
  if (fromOverride) return fromOverride
  const fromTemplate = labels?.[key]
  if (typeof fromTemplate === "string" && fromTemplate.length > 0) return fromTemplate
  return defaults[key]
}

function formatCents(cents: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currencyCode,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currencyCode}`
  }
}

type Props = {
  invoice: InvoiceWithRelations
  businessName?: string
  businessAddress?: string
  businessTaxId?: string
  labels?: Partial<LabelSet>
  template?: InvoiceTemplate | null
  logoBytes?: Buffer | null
}

export function InvoicePDF({
  invoice,
  businessName,
  businessAddress,
  businessTaxId,
  labels: labelOverrides,
  template,
  logoBytes,
}: Props) {
  const templateLabels = template?.labels ?? null
  // Pick a language-appropriate default set before layering template
  // overrides and caller overrides on top — so a Spanish-language template
  // with no per-label overrides still renders FACTURA / Fecha / etc.
  const defaults = defaultLabelsForLanguage(template?.language)
  const L = (key: keyof LabelSet) =>
    labelFor(key, templateLabels, defaults, labelOverrides)

  const { subtotal, vatTotal, total } = calcInvoiceTotals(invoice.items, invoice.totalCents)
  const currency = invoice.currencyCode || "EUR"

  const accent = template?.accentColor ?? DEFAULT_ACCENT
  const fontPreset: FontPreset = template?.fontPreset ?? DEFAULT_FONT
  const baseFont = fontFamilyFor(fontPreset, "regular")
  const boldFont = fontFamilyFor(fontPreset, "bold")
  const italicFont = fontFamilyFor(fontPreset, "italic")
  const logoPosition: LogoPosition = template?.logoPosition ?? DEFAULT_LOGO_POSITION
  const logoDataUri = logoBytes ? bufferToDataUri(logoBytes) : null
  const showVatColumn = template?.showVatColumn ?? true
  const showProminentTotal = template?.showProminentTotal ?? false
  const hasVatOnAnyItem = invoice.items.some((it) => it.vatRate > 0)
  const showVatInTotals = vatTotal > 0 || hasVatOnAnyItem

  // ── Header row: logo on one side, business details on the other ────────
  // Each slot is a vertical stack; `logoSlot` and `detailsSlot` swap left/
  // right based on logo_position. In "center" mode they stack vertically.
  const logoSlot = logoDataUri ? (
    <Image src={logoDataUri} style={{ maxWidth: 160, maxHeight: 70 }} />
  ) : null

  const detailsSlot = (
    <View>
      {template?.businessDetailsText
        ? template.businessDetailsText
            .split(/\r?\n/)
            .map((line, idx) => (
              <Text
                key={idx}
                style={{
                  fontSize: idx === 0 ? 13 : 10,
                  fontFamily: idx === 0 ? boldFont : baseFont,
                  color: idx === 0 ? "#111" : "#6b7280",
                }}
              >
                {line}
              </Text>
            ))
        : (
          <>
            <Text style={{ fontSize: 13, fontFamily: boldFont, marginBottom: 2 }}>
              {businessName || "Your Business"}
            </Text>
            {businessAddress &&
              businessAddress
                .split(/\r?\n/)
                .map((line, idx) => (
                  <Text key={idx} style={{ color: "#6b7280" }}>
                    {line}
                  </Text>
                ))}
            {businessTaxId && <Text style={{ color: "#6b7280" }}>NIF: {businessTaxId}</Text>}
          </>
        )}
    </View>
  )

  const headerBlock =
    logoPosition === "center" ? (
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        {logoSlot && <View style={{ marginBottom: 8 }}>{logoSlot}</View>}
        <View style={{ alignItems: "center" }}>{detailsSlot}</View>
      </View>
    ) : (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 28,
        }}
      >
        {logoPosition === "left" ? (
          <>
            <View>{logoSlot}</View>
            <View style={{ alignItems: "flex-end" }}>{detailsSlot}</View>
          </>
        ) : (
          <>
            <View>{detailsSlot}</View>
            <View style={{ alignItems: "flex-end" }}>{logoSlot}</View>
          </>
        )}
      </View>
    )

  // ── Invoice info row ────────────────────────────────────────────────────
  const invoiceTitleText = `${L("invoiceTitle")} #${invoice.number}`

  const clientBlock = (
    <View>
      <Text
        style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2, textTransform: "uppercase" }}
      >
        {L("billTo")}
      </Text>
      <Text style={{ fontSize: 11, fontFamily: boldFont }}>
        {invoice.client?.name || "—"}
      </Text>
      {invoice.client?.taxId && <Text style={{ color: "#6b7280" }}>{invoice.client.taxId}</Text>}
      {invoice.client?.address && <Text>{invoice.client.address}</Text>}
      {invoice.client?.email && <Text style={{ color: "#6b7280" }}>{invoice.client.email}</Text>}
    </View>
  )

  const datesBlock = (
    <View style={{ alignItems: "flex-end" }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" }}>
            {L("issueDate")}
          </Text>
          <Text style={{ fontSize: 11 }}>{format(invoice.issueDate, "dd/MM/yyyy")}</Text>
        </View>
        {invoice.dueDate && (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase" }}>
              {L("dueDate")}
            </Text>
            <Text style={{ fontSize: 11 }}>{format(invoice.dueDate, "dd/MM/yyyy")}</Text>
          </View>
        )}
      </View>
      {showProminentTotal && (
        <Text style={{ fontSize: 20, fontFamily: boldFont, marginTop: 12 }}>
          {L("prominentTotal")} {formatCents(total, currency)}
        </Text>
      )}
    </View>
  )

  return (
    <Document title={`Invoice ${invoice.number}`}>
      <Page
        size="A4"
        style={{ padding: 48, fontSize: 10, fontFamily: baseFont, color: "#111" }}
      >
        {headerBlock}

        {/* Invoice title row: title on the left, dates+total on the right. */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <Text
            style={{ fontSize: 16, fontFamily: boldFont, color: accent, maxWidth: "60%" }}
          >
            {invoiceTitleText}
          </Text>
          {datesBlock}
        </View>

        <View style={{ marginBottom: 24 }}>{clientBlock}</View>

        {template?.headerText && (
          <Text style={{ marginBottom: 16, color: "#374151" }}>{template.headerText}</Text>
        )}

        {/* ── Items table ─────────────────────────────────────────────── */}
        <View style={{ marginBottom: 16 }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#f3f4f6",
              padding: "6 8",
              fontFamily: boldFont,
              fontSize: 9,
            }}
          >
            <Text style={{ flex: 3 }}>{L("description")}</Text>
            <Text style={{ flex: 1, textAlign: "right" }}>{L("qty")}</Text>
            <Text style={{ flex: 1.5, textAlign: "right" }}>{L("unitPrice")}</Text>
            {showVatColumn && (
              <Text style={{ flex: 1, textAlign: "right" }}>{L("vatPercent")}</Text>
            )}
            <Text style={{ flex: 1.5, textAlign: "right" }}>{L("amount")}</Text>
          </View>
          {invoice.items.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                padding: "6 8",
                borderBottomWidth: 1,
                borderBottomColor: "#e5e7eb",
              }}
            >
              <Text style={{ flex: 3 }}>{item.description}</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>{item.quantity}</Text>
              <Text style={{ flex: 1.5, textAlign: "right" }}>
                {formatCents(item.unitPrice, currency)}
              </Text>
              {showVatColumn && (
                <Text style={{ flex: 1, textAlign: "right" }}>{item.vatRate}%</Text>
              )}
              <Text style={{ flex: 1.5, textAlign: "right" }}>
                {formatCents(item.quantity * item.unitPrice, currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Totals ──────────────────────────────────────────────────── */}
        <View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
            <Text style={{ width: 120, textAlign: "right", color: "#6b7280" }}>
              {L("subtotal")}
            </Text>
            <Text style={{ width: 100, textAlign: "right" }}>{formatCents(subtotal, currency)}</Text>
          </View>
          {showVatInTotals && (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
              <Text style={{ width: 120, textAlign: "right", color: "#6b7280" }}>{L("vat")}</Text>
              <Text style={{ width: 100, textAlign: "right" }}>
                {formatCents(vatTotal, currency)}
              </Text>
            </View>
          )}
          {invoice.irpfRate > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
              <Text style={{ width: 120, textAlign: "right", color: "#6b7280" }}>
                {L("irpfRetention")} ({invoice.irpfRate}%)
              </Text>
              <Text style={{ width: 100, textAlign: "right" }}>
                −{formatCents(Math.round(subtotal * invoice.irpfRate / 100), currency)}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 6 }}>
            <Text
              style={{ width: 120, textAlign: "right", fontFamily: boldFont, fontSize: 12 }}
            >
              {L("totalToPay")}
            </Text>
            <Text
              style={{
                width: 100,
                textAlign: "right",
                fontFamily: boldFont,
                fontSize: 12,
                color: accent,
              }}
            >
              {formatCents(
                total - (invoice.irpfRate > 0 ? Math.round(subtotal * invoice.irpfRate / 100) : 0),
                currency,
              )}
            </Text>
          </View>
        </View>

        {template?.belowTotalsText && (
          <View style={{ marginTop: 20 }}>
            {template.belowTotalsText.split(/\r?\n/).map((line, idx) => (
              <Text key={idx} style={{ fontFamily: italicFont, fontSize: 9 }}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {invoice.notes && (
          <View
            style={{
              marginTop: 20,
              padding: 12,
              backgroundColor: "#f9fafb",
              fontSize: 9,
              color: "#6b7280",
            }}
          >
            <Text style={{ fontFamily: boldFont, marginBottom: 4 }}>{L("notes")}</Text>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Bank details: pinned just above the footer ──────────────── */}
        {/* Absolute-positioned so it always sits adjacent to the footer
            regardless of content length — matches the "payment
            instructions at the bottom" convention on most invoices. */}
        {template?.showBankDetails && template?.bankDetailsText && (
          <View
            fixed
            style={{
              position: "absolute",
              bottom: 72,
              left: 48,
              right: 48,
              padding: 10,
              borderWidth: 1,
              borderColor: "#e5e7eb",
              fontSize: 9,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: boldFont, marginBottom: 4 }}>{L("bankDetails")}</Text>
            {template.bankDetailsText.split(/\r?\n/).map((line, idx) => (
              <Text key={idx} style={{ textAlign: "center" }}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {/* ── Footer: centered, multi-line ────────────────────────────── */}
        <View
          fixed
          style={{
            position: "absolute",
            bottom: 32,
            left: 48,
            right: 48,
            alignItems: "center",
          }}
        >
          {template?.footerText
            ? template.footerText
                .split(/\r?\n/)
                .map((line, idx) => (
                  <Text key={idx} style={{ fontSize: 8, color: "#6b7280", textAlign: "center" }}>
                    {line}
                  </Text>
                ))
            : (
              <Text style={{ fontSize: 8, color: "#9ca3af", textAlign: "center" }}>
                {businessName ?? ""} — {L("invoiceTitle")} {invoice.number} — {L("generated")}{" "}
                {format(new Date(), "dd/MM/yyyy")}
              </Text>
            )}
        </View>

        {/* ── Page N/Total in the bottom-right corner ─────────────────── */}
        {/* `fixed` + `render` makes react-pdf evaluate this on every
            page. Always shows "1/1" on single-page invoices by design —
            the user wanted consistent treatment regardless of length. */}
        <Text
          fixed
          style={{
            position: "absolute",
            bottom: 16,
            right: 48,
            fontSize: 8,
            color: "#9ca3af",
          }}
          render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
        />

        {/* ── Status watermark (draft / cancelled / rejected) ─────────── */}
        {/* Rendered last so it overlays everything else; the rotation +
            muted color makes it unmistakable without obscuring the data. */}
        {(() => {
          const key = watermarkLabelKey(invoice.status)
          if (!key) return null
          const text = L(key)
          return (
            <View
              fixed
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 110,
                  fontFamily: boldFont,
                  color: "#ef4444",
                  opacity: 0.14,
                  letterSpacing: 8,
                  transform: "rotate(-28deg)",
                }}
              >
                {text}
              </Text>
            </View>
          )
        })()}
      </Page>
    </Document>
  )
}

function bufferToDataUri(buffer: Buffer): string {
  // Sniff common image magic bytes so the data URI carries the right mime.
  // react-pdf's <Image> accepts data URIs; guessing correctly just makes
  // reader debugging easier — all three types render either way.
  const header = buffer.subarray(0, 4)
  let mime = "image/png"
  if (header[0] === 0xff && header[1] === 0xd8) mime = "image/jpeg"
  else if (header[0] === 0x47 && header[1] === 0x49) mime = "image/gif"
  else if (header[0] === 0x3c) mime = "image/svg+xml"
  return `data:${mime};base64,${buffer.toString("base64")}`
}
