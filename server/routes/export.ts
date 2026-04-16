/**
 * Fastify route for exporting transactions as a .zip bundle.
 *
 * URL: GET /export/transactions
 *
 * Builds a CSV of the user's transactions (filtered by the same params the
 * listing page accepts) and, when requested, bundles the attached files under
 * `files/<transactionId>/<filename>`. The Next.js era had this route as a
 * Next route handler; it was lost in the Vite migration and the client was
 * pointing at a 404 — the HTML index was being saved as `transactions.zip`,
 * which is what "corrupted zip" looked like.
 */
import type { FastifyInstance } from "fastify"
import { readFile } from "node:fs/promises"
import JSZip from "jszip"

import { getOrCreateSelfHostedUser } from "@/models/users"
import { getTransactions } from "@/models/transactions"
import { getFilesByIds } from "@/models/files"
import { getActiveEntityId } from "@/lib/entities"
import { fullPathForFile } from "@/lib/files"
import type { TransactionFilters } from "@/models/transactions"

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value)
  if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function pickField(tx: Record<string, unknown>, code: string): unknown {
  const direct = tx[code]
  if (direct !== undefined) return direct
  // Custom/extra fields live under `extra`.
  const extra = tx["extra"]
  if (extra && typeof extra === "object" && code in extra) {
    return (extra as Record<string, unknown>)[code]
  }
  return null
}

function pickName(code: string, tx: Record<string, unknown>): string | null {
  // Render nested category/project/account objects as their human-readable name.
  if (code === "categoryCode") {
    const category = tx["category"]
    if (category && typeof category === "object" && "name" in category) {
      const name = (category as Record<string, unknown>)["name"]
      if (typeof name === "string") return name
    }
    const fallback = tx["categoryCode"]
    return typeof fallback === "string" ? fallback : null
  }
  if (code === "projectCode") {
    const project = tx["project"]
    if (project && typeof project === "object" && "name" in project) {
      const name = (project as Record<string, unknown>)["name"]
      if (typeof name === "string") return name
    }
    const fallback = tx["projectCode"]
    return typeof fallback === "string" ? fallback : null
  }
  if (code === "accountId") {
    const name = tx["accountName"]
    return typeof name === "string" ? name : null
  }
  return null
}

function sanitizeFilename(raw: string): string {
  return raw.replace(/[/\\:*?"<>|]/g, "_").slice(0, 200) || "file"
}

export async function exportRoutes(app: FastifyInstance) {
  app.get("/export/transactions", async (request, reply) => {
    try {
      const user = await getOrCreateSelfHostedUser()
      if (!user) return reply.code(401).send({ error: "Not authenticated" })

      const q = request.query as Record<string, string | undefined>
      const filters: TransactionFilters = {}
      if (q["search"]) filters.search = q["search"]
      if (q["dateFrom"]) filters.dateFrom = q["dateFrom"]
      if (q["dateTo"]) filters.dateTo = q["dateTo"]
      if (q["ordering"]) filters.ordering = q["ordering"]
      if (q["categoryCode"]) filters.categoryCode = q["categoryCode"]
      if (q["projectCode"]) filters.projectCode = q["projectCode"]
      if (q["accountId"]) filters.accountId = q["accountId"]
      if (q["type"]) filters.type = q["type"]

      const fieldCodes = (q["fields"] ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)

      const includeAttachments = q["includeAttachments"] === "true"

      const { transactions } = await getTransactions(user.id, filters)

      // Effective column list. If the user didn't tick anything, fall back to
      // a sensible default so the CSV isn't empty.
      const columns = fieldCodes.length > 0
        ? fieldCodes
        : ["issuedAt", "name", "merchant", "total", "currencyCode", "categoryCode", "projectCode", "type", "status", "note"]

      // Build CSV.
      const header = columns.map(csvEscape).join(",")
      const rows = transactions.map((tx) => {
        const rec = tx as unknown as Record<string, unknown>
        return columns
          .map((code) => {
            const human = pickName(code, rec)
            if (human !== null) return csvEscape(human)
            return csvEscape(pickField(rec, code))
          })
          .join(",")
      })
      const csv = [header, ...rows].join("\n") + "\n"

      const zip = new JSZip()
      zip.file("transactions.csv", csv)

      if (includeAttachments) {
        const entityId = await getActiveEntityId()
        // Collect all referenced file ids.
        const fileIds = new Set<string>()
        const fileOwnerByTx = new Map<string, string[]>()
        for (const tx of transactions) {
          const ids = (tx as unknown as { files?: unknown }).files
          if (Array.isArray(ids)) {
            const txIds = ids.filter((v): v is string => typeof v === "string")
            if (txIds.length > 0) {
              fileOwnerByTx.set(tx.id, txIds)
              for (const id of txIds) fileIds.add(id)
            }
          }
        }

        if (fileIds.size > 0) {
          const files = await getFilesByIds([...fileIds], user.id)
          const byId = new Map(files.map((f) => [f.id, f]))
          for (const [txId, ids] of fileOwnerByTx) {
            for (const fileId of ids) {
              const file = byId.get(fileId)
              if (!file) continue
              try {
                const bytes = await readFile(fullPathForFile(entityId, file))
                zip.file(`files/${txId}/${sanitizeFilename(file.filename)}`, bytes)
              } catch (err) {
                // Missing bytes on disk shouldn't abort the whole export —
                // record a placeholder note so the user notices.
                const note = err instanceof Error ? err.message : String(err)
                zip.file(
                  `files/${txId}/_missing_${sanitizeFilename(file.filename)}.txt`,
                  `File could not be read: ${note}`,
                )
              }
            }
          }
        }
      }

      const buffer = await zip.generateAsync({ type: "nodebuffer" })

      reply.header("Content-Type", "application/zip")
      reply.header("Content-Length", String(buffer.length))
      reply.header(
        "Content-Disposition",
        `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.zip"`,
      )
      return reply.send(buffer)
    } catch (error) {
      console.error("[export/transactions] Error:", error)
      return reply.code(500).send({
        error: error instanceof Error ? error.message : "Export failed",
      })
    }
  })
}
