import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { xlsxBufferToCsv } from "@/lib/xlsx-to-csv"

function buildBuffer(rows: string[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

describe("xlsxBufferToCsv", () => {
  it("skips BBVA-style Spanish preamble and starts at the real header row", () => {
    // Mirrors the shape of a real BBVA export: 8 preamble rows (2-cell
    // metadata) above a blank separator row and the true column header.
    const rows: string[][] = [
      ["Titular", "", "ANIMUS SYSTEMS S.L."],
      ["Cuenta", "", "ES59 0182 ..."],
      ["Divisa", "", "EUR"],
      ["Banco", "", "BANCO BILBAO VIZCAYA ARGENTARIA S.A."],
      ["Fecha", "", "20/04/2026 Hora 15:53"],
      ["Importe", "", "Todos"],
      ["Periodo", "", "01/02/2026-28/02/2026"],
      ["Filtros", "", "Todos"],
      [],
      [
        "F. CONTABLE",
        "F. VALOR",
        "CÓDIGO",
        "CONCEPTO",
        "BENEFICIARIO/ORDENANTE",
        "OBSERVACIONES",
        "IMPORTE",
        "SALDO",
        "DIVISA",
        "OFICINA",
        "REMESA",
      ],
      [
        "26/02/2026",
        "26/02/2026",
        "00007",
        "TRANSFERS",
        "AXA SEGUROS GENERALES S.A.",
        "N.REC: 95735220",
        "122.36",
        "6397.78",
        "EUR",
        "4647",
        "0067086336604",
      ],
    ]

    const csv = xlsxBufferToCsv(buildBuffer(rows))
    const firstLine = csv.split("\n")[0] ?? ""

    expect(firstLine).toContain("F. CONTABLE")
    expect(firstLine).toContain("IMPORTE")
    expect(csv).not.toContain("Titular")
    expect(csv).not.toContain("Periodo")
  })

  it("keeps English headers working (regression for non-Spanish exports)", () => {
    const rows: string[][] = [
      ["Account statement", "", ""],
      ["Exported at", "", "2026-01-01"],
      [],
      ["Date", "Description", "Amount", "Currency", "Balance"],
      ["2026-01-02", "Coffee", "-3.50", "EUR", "996.50"],
    ]

    const csv = xlsxBufferToCsv(buildBuffer(rows))
    const firstLine = csv.split("\n")[0] ?? ""

    expect(firstLine).toContain("Date")
    expect(firstLine).toContain("Amount")
    expect(csv).not.toContain("Account statement")
  })

  it("falls back to the whole sheet when no recognizable header is found", () => {
    const rows: string[][] = [
      ["one", "two"],
      ["three", "four"],
    ]
    const csv = xlsxBufferToCsv(buildBuffer(rows))
    expect(csv.split("\n")[0]).toContain("one")
  })
})
