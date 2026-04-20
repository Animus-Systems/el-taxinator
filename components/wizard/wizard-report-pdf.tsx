/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { format } from "date-fns"
import type { SessionReport } from "@/ai/session-report"

/**
 * Render the session-report component to a PDF Buffer.
 *
 * Lives here (in the component file) so the JSX stays in .tsx and we don't
 * need a fake `as ReactElement<DocumentProps>` cast in server code.
 */
export async function renderWizardSessionReportPdf(report: SessionReport): Promise<Buffer> {
  return renderToBuffer(<WizardSessionReportPDF report={report} />)
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 24 },
  headerTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#4f46e5" },
  headerSub: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  businessLine: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 16 },
  metaItem: { flexDirection: "column", marginRight: 24, marginBottom: 4 },
  metaLabel: { fontSize: 8, color: "#9ca3af", textTransform: "uppercase" },
  metaValue: { fontSize: 10, color: "#111" },

  section: { marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#4f46e5", marginBottom: 6 },

  statRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  statLabel: { color: "#6b7280" },
  statValue: { fontFamily: "Helvetica-Bold" },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    padding: "4 6",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: { flexDirection: "row", padding: "4 6", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  colCategory: { flex: 3 },
  colCount: { flex: 1, textAlign: "right" },
  colAmount: { flex: 2, textAlign: "right" },
  colTaxRef: { flex: 2, color: "#6b7280" },

  tipBlock: {
    padding: 10,
    backgroundColor: "#fef3c7",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    marginBottom: 8,
  },
  tipTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  tipBody: { fontSize: 10, marginBottom: 4 },
  tipLegal: { fontSize: 8, color: "#6b7280", fontFamily: "Helvetica-Oblique" },

  factLine: { flexDirection: "row", marginBottom: 2 },
  factKey: { width: 160, color: "#6b7280" },
  factValue: { flex: 1 },

  digestRow: { flexDirection: "row", marginBottom: 4 },
  digestRole: { width: 60, fontFamily: "Helvetica-Bold", color: "#6b7280", textTransform: "uppercase", fontSize: 8 },
  digestContent: { flex: 1, fontSize: 9 },

  disclaimer: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f9fafb",
    fontSize: 8,
    color: "#6b7280",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
})

type Labels = {
  title: string
  generatedAt: string
  entity: string
  businessName: string
  nif: string
  totalsHeading: string
  byStatusHeading: string
  byCategoryHeading: string
  statusBusiness: string
  statusNonDeductible: string
  statusPersonalTaxable: string
  statusPersonal: string
  statusInternal: string
  statusNeedsReview: string
  countColumn: string
  amountColumn: string
  taxRefColumn: string
  grandTotal: string
  deductibleTotal: string
  nonDeductibleTotal: string
  personalTaxableTotal: string
  personalTotal: string
  taxRollupsHeading: string
  rollupDisposalProceeds: string
  rollupBasisPurchases: string
  rollupStakingRewards: string
  rollupAirdrops: string
  rollupPendingBasis: string
  taxTipsHeading: string
  noTaxTips: string
  factsHeading: string
  noFacts: string
  conversationHeading: string
  disclaimer: string
}

const defaultLabels: Labels = {
  title: "AI Accountant Session Report",
  generatedAt: "Generated",
  entity: "Entity type",
  businessName: "Business",
  nif: "NIF / CIF",
  totalsHeading: "Totals",
  byStatusHeading: "By status",
  byCategoryHeading: "By category",
  statusBusiness: "Business (deductible)",
  statusNonDeductible: "Business — non-deductible",
  statusPersonalTaxable: "Personal (taxable)",
  statusPersonal: "Personal (ignored)",
  statusInternal: "Internal (transfer / FX)",
  statusNeedsReview: "Needs review",
  countColumn: "Count",
  amountColumn: "Amount",
  taxRefColumn: "Tax form",
  grandTotal: "Grand total",
  deductibleTotal: "Deductible total",
  nonDeductibleTotal: "Non-deductible total",
  personalTaxableTotal: "Personal — taxable",
  personalTotal: "Personal — ignored",
  taxRollupsHeading: "Tax-meaningful rollups",
  rollupDisposalProceeds: "Crypto disposal proceeds",
  rollupBasisPurchases: "Crypto purchases (building basis)",
  rollupStakingRewards: "Crypto staking rewards",
  rollupAirdrops: "Crypto airdrops",
  rollupPendingBasis: "{count} disposals need FIFO basis",
  taxTipsHeading: "Tax-optimization tips from this session",
  noTaxTips: "No tax tips were captured during this session.",
  factsHeading: "Business facts learned",
  noFacts: "No new business facts were recorded during this session.",
  conversationHeading: "Conversation digest",
  disclaimer:
    "This report is generated by an AI accountant and is intended as a starting point. Tax-saving tips cite legal references but should be verified with a licensed asesor fiscal before filing.",
}

type Props = {
  report: SessionReport
  labels?: Partial<Labels>
}

function formatMoney(cents: number, currency: string | null) {
  const locale = currency === "USD" ? "en-US" : "es-ES"
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim()
  }
}

export function WizardSessionReportPDF({ report, labels: userLabels }: Props) {
  const L: Labels = { ...defaultLabels, ...userLabels }
  const ccy = report.totals.currencyCode
  const digestLimit = 20

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{L.title}</Text>
          <Text style={styles.headerSub}>
            {report.session.title || report.session.fileName || report.session.id}
            {report.session.bankName ? ` · ${report.session.bankName}` : ""}
          </Text>
          <Text style={styles.businessLine}>{report.user.businessName || ""}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{L.entity}</Text>
              <Text style={styles.metaValue}>{report.user.entityType || "—"}</Text>
            </View>
            {report.user.nif ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>{L.nif}</Text>
                <Text style={styles.metaValue}>{report.user.nif}</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{L.generatedAt}</Text>
              <Text style={styles.metaValue}>
                {format(report.generatedAt, "yyyy-MM-dd HH:mm")}
              </Text>
            </View>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L.totalsHeading}</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{L.grandTotal}</Text>
            <Text style={styles.statValue}>{formatMoney(report.totals.grandTotal, ccy)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{L.deductibleTotal}</Text>
            <Text style={styles.statValue}>{formatMoney(report.totals.deductibleTotal, ccy)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{L.nonDeductibleTotal}</Text>
            <Text style={styles.statValue}>{formatMoney(report.totals.nonDeductibleTotal, ccy)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{L.personalTaxableTotal}</Text>
            <Text style={styles.statValue}>
              {formatMoney(report.totals.personalTaxableTotal, ccy)}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>{L.personalTotal}</Text>
            <Text style={styles.statValue}>{formatMoney(report.totals.personalTotal, ccy)}</Text>
          </View>
        </View>

        {/* Tax-meaningful rollups */}
        {report.taxRollups.disposalCount > 0 ||
        report.taxRollups.basisPurchases > 0 ||
        report.taxRollups.stakingRewards > 0 ||
        report.taxRollups.airdrops > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{L.taxRollupsHeading}</Text>
            {report.taxRollups.disposalCount > 0 ? (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>
                  {L.rollupDisposalProceeds}
                  {report.taxRollups.pendingBasisCount > 0
                    ? ` · ${L.rollupPendingBasis.replace(
                        "{count}",
                        String(report.taxRollups.pendingBasisCount),
                      )}`
                    : ""}
                </Text>
                <Text style={styles.statValue}>
                  {formatMoney(report.taxRollups.disposalProceeds, ccy)}
                </Text>
              </View>
            ) : null}
            {report.taxRollups.basisPurchases > 0 ? (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{L.rollupBasisPurchases}</Text>
                <Text style={styles.statValue}>
                  {formatMoney(report.taxRollups.basisPurchases, ccy)}
                </Text>
              </View>
            ) : null}
            {report.taxRollups.stakingRewards > 0 ? (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{L.rollupStakingRewards}</Text>
                <Text style={styles.statValue}>
                  {formatMoney(report.taxRollups.stakingRewards, ccy)}
                </Text>
              </View>
            ) : null}
            {report.taxRollups.airdrops > 0 ? (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{L.rollupAirdrops}</Text>
                <Text style={styles.statValue}>
                  {formatMoney(report.taxRollups.airdrops, ccy)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* By status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L.byStatusHeading}</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colCategory}>Status</Text>
            <Text style={styles.colCount}>{L.countColumn}</Text>
            <Text style={styles.colAmount}>{L.amountColumn}</Text>
          </View>
          {renderStatusRow(L.statusBusiness, report.totals.byStatus["business"], ccy)}
          {renderStatusRow(L.statusNonDeductible, report.totals.byStatus["business_non_deductible"], ccy)}
          {renderStatusRow(L.statusPersonalTaxable, report.totals.byStatus["personal_taxable"], ccy)}
          {renderStatusRow(L.statusPersonal, report.totals.byStatus["personal_ignored"], ccy)}
          {renderStatusRow(L.statusInternal, report.totals.byStatus["internal"], ccy)}
          {renderStatusRow(L.statusNeedsReview, report.totals.byStatus["needs_review"], ccy)}
        </View>

        {/* By category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L.byCategoryHeading}</Text>
          {report.totals.byCategory.length > 0 ? (
            <>
              <View style={styles.tableHeader}>
                <Text style={styles.colCategory}>Category</Text>
                <Text style={styles.colCount}>{L.countColumn}</Text>
                <Text style={styles.colAmount}>{L.amountColumn}</Text>
                <Text style={styles.colTaxRef}>{L.taxRefColumn}</Text>
              </View>
              {report.totals.byCategory.map((c) => (
                <View style={styles.tableRow} key={c.code}>
                  <Text style={styles.colCategory}>{c.name}</Text>
                  <Text style={styles.colCount}>{c.count}</Text>
                  <Text style={styles.colAmount}>{formatMoney(c.amount, ccy)}</Text>
                  <Text style={styles.colTaxRef}>{c.taxFormRef ?? ""}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={{ color: "#6b7280" }}>—</Text>
          )}
        </View>

        {/* Tax tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L.taxTipsHeading}</Text>
          {report.taxTipsCollected.length === 0 ? (
            <Text style={{ color: "#6b7280" }}>{L.noTaxTips}</Text>
          ) : (
            report.taxTipsCollected.map((tip, i) => (
              <View style={styles.tipBlock} key={i} wrap={false}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipBody}>{tip.body}</Text>
                <Text style={styles.tipLegal}>{tip.legalBasis}</Text>
              </View>
            ))
          )}
        </View>

        {/* Facts learned */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>{L.factsHeading}</Text>
          {report.businessFactsLearned.length === 0 ? (
            <Text style={{ color: "#6b7280" }}>{L.noFacts}</Text>
          ) : (
            report.businessFactsLearned.map((f) => (
              <View style={styles.factLine} key={f.id}>
                <Text style={styles.factKey}>{f.key}</Text>
                <Text style={styles.factValue}>{f.value.text}</Text>
              </View>
            ))
          )}
        </View>

        {/* Conversation digest */}
        {report.conversationDigest.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{L.conversationHeading}</Text>
            {report.conversationDigest.slice(-digestLimit).map((m, i) => (
              <View style={styles.digestRow} key={i} wrap={false}>
                <Text style={styles.digestRole}>{m.role}</Text>
                <Text style={styles.digestContent}>{m.content}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.disclaimer}>{L.disclaimer}</Text>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${report.generatedBy} · Page ${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}

function renderStatusRow(label: string, value: { count: number; amount: number } | undefined, ccy: string | null) {
  const count = value?.count ?? 0
  const amount = value?.amount ?? 0
  return (
    <View style={styles.tableRow}>
      <Text style={styles.colCategory}>{label}</Text>
      <Text style={styles.colCount}>{count}</Text>
      <Text style={styles.colAmount}>{formatMoney(amount, ccy)}</Text>
    </View>
  )
}
