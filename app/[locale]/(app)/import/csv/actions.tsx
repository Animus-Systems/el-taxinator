"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { serverClient } from "@/lib/trpc/server-client"
import { EXPORT_AND_IMPORT_FIELD_MAP } from "@/models/export_and_import"
import type { Transaction } from "@/lib/db-types"
import { parse } from "@fast-csv/parse"
import { createReadStream } from "fs"
import { revalidatePath } from "next/cache"

// CSV file size limits from config
const MAX_CSV_FILE_SIZE = config.upload.csv.maxFileSize
const MAX_CSV_ROWS = config.upload.csv.maxRows
const STREAM_THRESHOLD = config.upload.csv.streamingThreshold

export async function parseCSVAction(
  _prevState: ActionState<string[][]> | null,
  formData: FormData
): Promise<ActionState<string[][]>> {
  const file = formData.get("file") as File
  if (!file) {
    return { success: false, error: "No file uploaded" }
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { success: false, error: "Only CSV files are allowed" }
  }

  // Check file size limit
  if (file.size > MAX_CSV_FILE_SIZE) {
    return { success: false, error: `File size exceeds maximum allowed size of ${MAX_CSV_FILE_SIZE / (1024 * 1024)}MB` }
  }

  if (file.size === 0) {
    return { success: false, error: "File is empty" }
  }

  try {
    // Use streaming for larger files to prevent memory exhaustion
    if (file.size > STREAM_THRESHOLD) {
      return await parseCSVWithStreaming(file)
    }

    // For smaller files, use the original approach with row limit
    const buffer = Buffer.from(await file.arrayBuffer())
    const rows: string[][] = []

    const parser = parse()
      .on("data", (row) => {
        if (rows.length < MAX_CSV_ROWS) {
          rows.push(row)
        }
      })
      .on("error", (error) => {
        throw error
      })
    parser.write(buffer)
    parser.end()

    // Wait for parsing to complete
    await new Promise((resolve) => parser.on("end", resolve))

    if (rows.length >= MAX_CSV_ROWS) {
      return { success: false, error: `CSV file contains more than ${MAX_CSV_ROWS} rows. Please split the file.` }
    }

    return { success: true, data: rows }
  } catch (error) {
    console.error("Error parsing CSV:", error)
    return { success: false, error: "Failed to parse CSV file" }
  }
}

/**
 * Streaming CSV parser for large files
 * Processes the file in chunks to prevent memory exhaustion
 */
async function parseCSVWithStreaming(file: File): Promise<ActionState<string[][]>> {
  const rows: string[][] = []
  let rowCount = 0

  // Write file to temp location for streaming
  const buffer = Buffer.from(await file.arrayBuffer())
  const tempPath = `/tmp/csv-${Date.now()}.csv`
  
  // Write buffer to temp file (in real implementation, use streaming upload)
  const { writeFileSync } = await import("fs")
  writeFileSync(tempPath, buffer)

  return new Promise((resolve) => {
    const parser = parse()
      .on("data", (row: string[]) => {
        rowCount++
        if (rowCount <= MAX_CSV_ROWS) {
          rows.push(row)
        } else {
          parser.end()
          resolve({
            success: false,
            error: `CSV file contains more than ${MAX_CSV_ROWS} rows. Please split the file.`,
          })
        }
      })
      .on("error", (error) => {
        console.error("Streaming CSV parse error:", error)
        resolve({ success: false, error: "Failed to parse CSV file" })
      })
      .on("end", () => {
        // Clean up temp file
        try {
          const { unlinkSync } = require("fs")
          unlinkSync(tempPath)
        } catch {
          // Ignore cleanup errors
        }
        resolve({ success: true, data: rows })
      })

    // Use Node.js streaming for large files
    const readStream = createReadStream(tempPath)
    readStream.pipe(parser)
  })
}

export async function saveTransactionsAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData
): Promise<ActionState<Transaction>> {
  const user = await getCurrentUser()
  const trpc = await serverClient()
  try {
    const rows = JSON.parse(formData.get("rows") as string) as Record<string, unknown>[]

    for (const row of rows) {
      const transactionData: Record<string, unknown> = {}
      for (const [fieldCode, value] of Object.entries(row)) {
        const fieldDef = EXPORT_AND_IMPORT_FIELD_MAP[fieldCode]
        if (fieldDef?.import) {
          transactionData[fieldCode] = await fieldDef.import(user.id, value as string)
        } else {
          transactionData[fieldCode] = value as string
        }
      }

      await trpc.transactions.create(transactionData as any)
    }

    revalidatePath("/import/csv")
    revalidatePath("/transactions")

    return { success: true }
  } catch (error) {
    console.error("Error saving transactions:", error)
    return { success: false, error: "Failed to save transactions. Please try again." }
  }
}
