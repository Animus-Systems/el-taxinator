import { getCurrentUser } from "@/lib/auth"

/** Convert a 2D string array to semicolon-separated CSV with BOM for Excel. */
function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map(row => row.map(cell => `"${(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n")
}
import { getActiveEntity } from "@/lib/entities"
import { getTransactions } from "@/models/transactions"
import { getInvoices, getQuotes } from "@/models/invoices"
import { getTimeEntries } from "@/models/time-entries"
import { getCategories } from "@/models/categories"
import { getProjects } from "@/models/projects"
import { getFields } from "@/models/fields"
import { getFilesByIds } from "@/models/files"
import { calcModelo420, calcModelo130, type Quarter } from "@/models/tax"
import { calcModelo202 } from "@/models/tax-sl"
import { fileExists, fullPathForFile } from "@/lib/files"
import { getLocalizedValue } from "@/lib/i18n-db"
import { EXPORT_AND_IMPORT_FIELD_MAP } from "@/models/export_and_import"
import { format as csvFormat } from "@fast-csv/format"
import { formatDate } from "date-fns"
import fs from "fs/promises"
import JSZip from "jszip"
import { NextResponse } from "next/server"
import path from "path"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get("year") ?? "") || new Date().getFullYear()
  const quarter = url.searchParams.get("quarter") ? parseInt(url.searchParams.get("quarter")!) as Quarter : null
  const includeAttachments = url.searchParams.get("attachments") !== "false"

  const user = await getCurrentUser()
  const entity = await getActiveEntity()

  const zip = new JSZip()

  // Determine date range
  let dateFrom: string
  let dateTo: string
  let periodLabel: string

  if (quarter) {
    const qStart = [0, 3, 6, 9][quarter - 1]
    dateFrom = `${year}-${String(qStart + 1).padStart(2, "0")}-01`
    const endMonth = qStart + 3
    const endDate = new Date(year, endMonth, 0)
    dateTo = formatDate(endDate, "yyyy-MM-dd")
    periodLabel = `${year}-Q${quarter}`
  } else {
    dateFrom = `${year}-01-01`
    dateTo = `${year}-12-31`
    periodLabel = `${year}`
  }

  // ─── Metadata ──────────────────────────────────────────────────────────
  zip.file("README.txt", [
    `Accountant Data Export — ${entity.name}`,
    `Period: ${periodLabel}`,
    `Entity type: ${entity.type === "sl" ? "Sociedad Limitada" : "Autónomo"}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `Contents:`,
    `  transactions/    — All transactions as CSV + receipt attachments`,
    `  invoices/        — Invoice summary CSV`,
    `  tax/             — Tax calculation reports (Modelo 420, 130/202)`,
    `  time/            — Time entries CSV (if any)`,
  ].join("\n"))

  // ─── Transactions CSV ──────────────────────────────────────────────────
  const { transactions } = await getTransactions(user.id, { dateFrom, dateTo })
  const fields = await getFields(user.id)
  const categories = await getCategories(user.id)
  const projects = await getProjects(user.id)

  const txCsvRows: string[][] = []
  const txHeaders = ["Date", "Name", "Merchant", "Type", "Category", "Project", "Total", "Currency", "Converted Total", "Converted Currency", "Description", "Note"]
  txCsvRows.push(txHeaders)

  for (const tx of transactions) {
    txCsvRows.push([
      tx.issuedAt ? formatDate(new Date(tx.issuedAt), "yyyy-MM-dd") : "",
      tx.name ?? "",
      tx.merchant ?? "",
      tx.type ?? "",
      getLocalizedValue(tx.category?.name, "en") || tx.categoryCode || "",
      getLocalizedValue(tx.project?.name, "en") || tx.projectCode || "",
      tx.total != null ? (tx.total / 100).toFixed(2) : "",
      tx.currencyCode ?? "",
      tx.convertedTotal != null ? (tx.convertedTotal / 100).toFixed(2) : "",
      tx.convertedCurrencyCode ?? "",
      tx.description ?? "",
      tx.note ?? "",
    ])
  }

  zip.file("transactions/transactions.csv", toCsv(txCsvRows)) // BOM for Excel

  // ─── Transaction Attachments (bulk-loaded) ──────────────────────────────
  if (includeAttachments) {
    // Collect all file IDs from all transactions in one pass
    const allFileIds = new Set<string>()
    const txFileMap = new Map<string, string[]>()
    for (const tx of transactions) {
      const fileIds = Array.isArray(tx.files) ? (tx.files as string[]) : []
      txFileMap.set(tx.id, fileIds)
      for (const fid of fileIds) allFileIds.add(fid)
    }

    // Single bulk query for all files
    const allFiles = await getFilesByIds([...allFileIds], user.id)
    const fileById = new Map(allFiles.map((f) => [f.id, f]))

    for (const tx of transactions) {
      const fileIds = txFileMap.get(tx.id) ?? []
      for (const fid of fileIds) {
        const file = fileById.get(fid)
        if (!file) continue
        try {
          const fullPath = fullPathForFile(user as any, file as any)
          if (await fileExists(fullPath)) {
            const buffer = await fs.readFile(fullPath)
            const txDate = tx.issuedAt ? formatDate(new Date(tx.issuedAt), "yyyy-MM-dd") : "unknown"
            const safeName = (tx.name ?? tx.merchant ?? "transaction").replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50)
            zip.file(`transactions/files/${txDate}-${safeName}/${file.filename}`, buffer)
          }
        } catch {}
      }
    }
  }

  // ─── Invoices CSV ──────────────────────────────────────────────────────
  const allInvoices = await getInvoices(user.id)
  const periodInvoices = allInvoices.filter(inv => {
    const d = inv.issueDate ? formatDate(new Date(inv.issueDate), "yyyy-MM-dd") : ""
    return d >= dateFrom && d <= dateTo
  })

  const invHeaders = ["Number", "Date", "Due Date", "Client", "Status", "Subtotal", "IGIC", "IRPF", "Total", "Paid At"]
  const invRows: string[][] = [invHeaders]

  for (const inv of periodInvoices) {
    const subtotal = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const igic = inv.items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0)
    const irpf = subtotal * ((inv.irpfRate ?? 0) / 100)
    const total = subtotal + igic - irpf

    invRows.push([
      inv.number,
      inv.issueDate ? formatDate(new Date(inv.issueDate), "yyyy-MM-dd") : "",
      inv.dueDate ? formatDate(new Date(inv.dueDate), "yyyy-MM-dd") : "",
      inv.client?.name ?? "",
      inv.status,
      (subtotal / 100).toFixed(2),
      (igic / 100).toFixed(2),
      (irpf / 100).toFixed(2),
      (total / 100).toFixed(2),
      inv.paidAt ? formatDate(new Date(inv.paidAt), "yyyy-MM-dd") : "",
    ])
  }

  zip.file("invoices/invoices.csv", toCsv(invRows))

  // ─── Tax Reports ───────────────────────────────────────────────────────
  const quarters: Quarter[] = quarter ? [quarter] : [1, 2, 3, 4]

  const taxLines: string[] = [
    `Tax Report — ${entity.name}`,
    `Period: ${periodLabel}`,
    `Entity type: ${entity.type === "sl" ? "Sociedad Limitada" : "Autónomo"}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ]

  // Pre-compute all tax results to avoid duplicate calculations
  const taxResultsCache = new Map<number, { m420: Awaited<ReturnType<typeof calcModelo420>>; secondary: unknown }>()

  for (const q of quarters) {
    const [m420, secondary] = await Promise.all([
      calcModelo420(user.id, year, q),
      entity.type === "autonomo"
        ? calcModelo130(user.id, year, q)
        : calcModelo202(user.id, year, q),
    ])
    taxResultsCache.set(q, { m420, secondary })
  }

  for (const q of quarters) {
    const m420 = taxResultsCache.get(q)!.m420
    taxLines.push(
      `=== Q${q} — Modelo 420 (IGIC) ===`,
      `Period: ${formatDate(m420.period.start, "dd/MM/yyyy")} – ${formatDate(m420.period.end, "dd/MM/yyyy")}`,
      `Invoices: ${m420.invoiceCount} | Expenses: ${m420.expenseCount}`,
      ``,
      `IGIC Devengado:`,
      `  Base tipo cero (0%):        ${(m420.baseZero / 100).toFixed(2)} EUR`,
      `  Base tipo reducido (3%):    ${(m420.baseReducido / 100).toFixed(2)} EUR  →  Cuota: ${(m420.cuotaReducido / 100).toFixed(2)} EUR`,
      `  Base tipo general (7%):     ${(m420.baseGeneral / 100).toFixed(2)} EUR  →  Cuota: ${(m420.cuotaGeneral / 100).toFixed(2)} EUR`,
      `  Base tipo incrementado:     ${(m420.baseIncrementado / 100).toFixed(2)} EUR  →  Cuota: ${(m420.cuotaIncrementado / 100).toFixed(2)} EUR`,
      `  Base tipo especial (15%+):  ${(m420.baseEspecial / 100).toFixed(2)} EUR  →  Cuota: ${(m420.cuotaEspecial / 100).toFixed(2)} EUR`,
      `  Total IGIC devengado:       ${(m420.totalIgicDevengado / 100).toFixed(2)} EUR`,
      ``,
      `IGIC Deducible (estimado):`,
      `  Base deducible:             ${(m420.baseDeducible / 100).toFixed(2)} EUR`,
      `  Cuota deducible:            ${(m420.cuotaDeducible / 100).toFixed(2)} EUR`,
      ``,
      `RESULTADO:                    ${(m420.resultado / 100).toFixed(2)} EUR ${m420.resultado >= 0 ? "(a ingresar)" : "(a compensar/devolver)"}`,
      "",
    )

    if (entity.type === "autonomo") {
      const m130 = taxResultsCache.get(q)!.secondary as Awaited<ReturnType<typeof calcModelo130>>
      taxLines.push(
        `=== Q${q} — Modelo 130 (IRPF) ===`,
        `Ingresos (acumulado):     ${(m130.casilla01_ingresos / 100).toFixed(2)} EUR`,
        `Gastos (acumulado):       ${(m130.casilla02_gastos / 100).toFixed(2)} EUR`,
        `Rendimiento neto:         ${(m130.casilla03_rendimientoNeto / 100).toFixed(2)} EUR`,
        `Cuota (20%):              ${(m130.casilla04_cuota20pct / 100).toFixed(2)} EUR`,
        `IRPF retenido:            ${(m130.casilla05_irpfRetenido / 100).toFixed(2)} EUR`,
        `A ingresar:               ${(m130.casilla06_aIngresar / 100).toFixed(2)} EUR`,
        "",
      )
    } else {
      const m202 = taxResultsCache.get(q)!.secondary as Awaited<ReturnType<typeof calcModelo202>>
      taxLines.push(
        `=== Q${q} — Modelo 202 (Impuesto de Sociedades) ===`,
        `Base imponible:           ${(m202.casilla01_baseImponible / 100).toFixed(2)} EUR`,
        `Tipo gravamen:            ${m202.casilla02_tipoGravamen}%`,
        `Cuota integra:            ${(m202.casilla03_cuotaIntegra / 100).toFixed(2)} EUR`,
        `Pagos a cuenta previos:   ${(m202.casilla04_pagosACuenta / 100).toFixed(2)} EUR`,
        `A ingresar:               ${(m202.casilla05_aIngresar / 100).toFixed(2)} EUR`,
        "",
      )
    }
  }

  zip.file("tax/tax-report.txt", taxLines.join("\n"))

  // ─── Tax CSV summary (reuses results from text report above) ─────────
  const taxCsvHeaders = ["Quarter", "IGIC Devengado", "IGIC Deducible", "IGIC Resultado",
    entity.type === "autonomo" ? "IRPF A Ingresar" : "IS A Ingresar"]
  const taxCsvRows: string[][] = [taxCsvHeaders]

  for (const q of quarters) {
    const { m420, secondary } = taxResultsCache.get(q)!
    let secondaryAmount: string
    if (entity.type === "autonomo") {
      const m130 = secondary as Awaited<ReturnType<typeof calcModelo130>>
      secondaryAmount = (m130.casilla06_aIngresar / 100).toFixed(2)
    } else {
      const m202 = secondary as Awaited<ReturnType<typeof calcModelo202>>
      secondaryAmount = (m202.casilla05_aIngresar / 100).toFixed(2)
    }
    taxCsvRows.push([
      `Q${q}`,
      (m420.totalIgicDevengado / 100).toFixed(2),
      (m420.cuotaDeducible / 100).toFixed(2),
      (m420.resultado / 100).toFixed(2),
      secondaryAmount,
    ])
  }

  zip.file("tax/tax-summary.csv", toCsv(taxCsvRows))

  // ─── Time Entries CSV ──────────────────────────────────────────────────
  const timeEntries = await getTimeEntries(user.id, { dateFrom, dateTo })

  if (timeEntries.length > 0) {
    const timeHeaders = ["Date", "Description", "Project", "Client", "Duration (min)", "Hourly Rate", "Currency", "Billable", "Invoiced", "Notes"]
    const timeRows: string[][] = [timeHeaders]

    for (const te of timeEntries) {
      timeRows.push([
        te.startedAt ? formatDate(new Date(te.startedAt), "yyyy-MM-dd") : "",
        te.description ?? "",
        getLocalizedValue(te.project?.name, "en") || "",
        te.client?.name ?? "",
        te.durationMinutes?.toString() ?? "",
        te.hourlyRate?.toString() ?? "",
        te.currencyCode ?? "",
        te.isBillable ? "Yes" : "No",
        te.isInvoiced ? "Yes" : "No",
        te.notes ?? "",
      ])
    }

    zip.file("time/time-entries.csv", toCsv(timeRows))
  }

  // ─── Categories & Projects reference ───────────────────────────────────
  const catLines = categories.map(c => `${c.code};${getLocalizedValue(c.name, "en")};${c.color}`).join("\n")
  zip.file("reference/categories.csv", "Code;Name;Color\n" + catLines)

  const projLines = projects.map(p => `${p.code};${getLocalizedValue(p.name, "en")};${p.color}`).join("\n")
  zip.file("reference/projects.csv", "Code;Name;Color\n" + projLines)

  // ─── Generate ZIP ──────────────────────────────────────────────────────
  const zipBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  const entitySlug = entity.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
  const filename = `accountant-export-${entitySlug}-${periodLabel}.zip`

  return new NextResponse(Buffer.from(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.length),
    },
  })
}
