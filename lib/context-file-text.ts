import { readFile } from "node:fs/promises"

import { fileExists, fullPathForFile } from "@/lib/files"
import { getActiveEntityId } from "@/lib/entities"
import { getFileById } from "@/models/files"
import { xlsxBufferToCsv, isXlsxFileName, isXlsxMimeType } from "@/lib/xlsx-to-csv"

/**
 * Characters of extracted text allowed per context file. Keeps a two-file
 * payload well under the wizard prompt budget so candidates + conversation
 * still fit comfortably.
 */
const PER_FILE_CHAR_CAP = 4000

export type ContextFileText = {
  fileId: string
  fileName: string
  fileType: string
  text: string
  truncated: boolean
}

/**
 * Load the text content of a context file attached to an import session. CSVs
 * are returned as UTF-8 text; PDFs are a best-effort extraction (if extraction
 * is unavailable we return a clearly-marked placeholder rather than throwing).
 * Each result is capped at `PER_FILE_CHAR_CAP` so the wizard prompt stays
 * within a reasonable token budget.
 *
 * Returns `null` when the file does not exist for this user or is missing on
 * disk — callers should filter these out silently (a deleted context file
 * should not break a wizard turn).
 */
export async function loadContextFileText(
  fileId: string,
  userId: string,
): Promise<ContextFileText | null> {
  const file = await getFileById(fileId, userId)
  if (!file) return null

  const entityId = await getActiveEntityId()
  const absPath = fullPathForFile(entityId, file)
  if (!(await fileExists(absPath))) return null

  const buffer = await readFile(absPath)
  const lowerName = file.filename.toLowerCase()
  const isCsv = file.mimetype === "text/csv" || lowerName.endsWith(".csv")
  const isPdf = file.mimetype === "application/pdf" || lowerName.endsWith(".pdf")
  const isXlsx = isXlsxFileName(file.filename) || isXlsxMimeType(file.mimetype)

  let raw: string
  if (isCsv) {
    raw = buffer.toString("utf8")
  } else if (isXlsx) {
    // Convert the first sheet to CSV text so the LLM sees tabular rows rather
    // than binary Office XML. Best-effort: a malformed workbook falls through
    // to the generic UTF-8 path.
    try {
      raw = xlsxBufferToCsv(buffer)
    } catch {
      raw = "[XLSX text extraction not available]"
    }
  } else if (isPdf) {
    raw = await extractPdfText(buffer)
  } else {
    // Plain/unknown: treat as UTF-8 text. If it's binary the result will be
    // gibberish, but the prompt framing ("Supplementary context") makes it
    // clear to the LLM that it's reference-only material.
    raw = buffer.toString("utf8")
  }

  const truncated = raw.length > PER_FILE_CHAR_CAP
  return {
    fileId: file.id,
    fileName: file.filename,
    fileType: file.mimetype,
    text: truncated ? raw.slice(0, PER_FILE_CHAR_CAP) : raw,
    truncated,
  }
}

/**
 * Best-effort PDF → text. The project does not currently ship with a
 * low-level PDF text extractor (ai/import-pdf.ts relies on vision-capable LLMs
 * reading the image previews). `pdf-parse` is tried as a lazy import so that
 * operators who install it get extraction for free, without forcing a new
 * dependency on everyone. When it is unavailable we fall back to a clearly
 * labelled placeholder so the wizard still sees *something* descriptive.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // `pdf-parse` is an optional dep: when present we use it for plain-text
  // extraction; when absent the fallback still emits a useful placeholder so
  // the prompt clearly signals "PDF text unavailable here" rather than lying
  // with empty content.
  try {
    // Indirect import keeps tsc happy when the package isn't installed. The
    // dynamic specifier also defeats bundler static analysis that would
    // otherwise try to resolve it at build time.
    const moduleName = "pdf-parse"
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      default?: (data: Buffer) => Promise<{ text?: string }>
    }
    const pdfParse = mod.default
    if (typeof pdfParse !== "function") {
      return "[PDF text extraction not available]"
    }
    const result = await pdfParse(buffer)
    return result.text ?? ""
  } catch {
    return "[PDF text extraction not available]"
  }
}
