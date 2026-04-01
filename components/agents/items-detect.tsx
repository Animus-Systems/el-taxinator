"use client"

import { formatCurrency } from "@/lib/utils"
import { splitFileIntoItemsAction, splitAndSaveAllAction } from "@/actions/unsorted"
import { useNotification } from "@/lib/context"
import type { File } from "@/lib/db-types"
import type { TransactionData } from "@/models/transactions"
import type { InvoiceMatch } from "@/ai/invoice-matcher"
import { ArrowDownToLine, Link2, Loader2, Split } from "lucide-react"
import { useState } from "react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"

type Props = {
  file?: File
  data: TransactionData
  invoiceMatches?: Record<number, InvoiceMatch[]>
}

export const ItemsDetectTool = ({ file, data, invoiceMatches }: Props) => {
  const { showNotification } = useNotification()
  const [isSplitting, setIsSplitting] = useState(false)
  const [isSavingAll, setIsSavingAll] = useState(false)

  const handleSplit = async () => {
    if (!file) return
    setIsSplitting(true)
    try {
      const formData = new FormData()
      formData.append("fileId", file.id)
      formData.append("items", JSON.stringify(data.items))
      const result = await splitFileIntoItemsAction(null, formData)
      if (result.success) {
        showNotification({ code: "global.banner", message: "Split successful!", type: "success" })
        showNotification({ code: "sidebar.unsorted", message: "new" })
        setTimeout(() => showNotification({ code: "sidebar.unsorted", message: "" }), 3000)
      } else {
        showNotification({ code: "global.banner", message: result.error || "Failed to split", type: "failed" })
      }
    } catch (error) {
      console.error("Failed to split items:", error)
    } finally {
      setIsSplitting(false)
    }
  }

  const handleSplitAndSaveAll = async () => {
    if (!file) return
    setIsSavingAll(true)
    try {
      const formData = new FormData()
      formData.append("fileId", file.id)
      formData.append("items", JSON.stringify(data.items))
      const result = await splitAndSaveAllAction(null, formData)
      if (result.success) {
        showNotification({ code: "global.banner", message: `Saved ${data.items?.length ?? 0} transactions!`, type: "success" })
        showNotification({ code: "sidebar.transactions", message: "new" })
        setTimeout(() => showNotification({ code: "sidebar.transactions", message: "" }), 3000)
      } else {
        showNotification({ code: "global.banner", message: result.error || "Failed to save", type: "failed" })
      }
    } catch (error) {
      console.error("Failed to save all:", error)
    } finally {
      setIsSavingAll(false)
    }
  }

  const confidenceColor = {
    high: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-gray-100 text-gray-600",
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-border">
        {data.items?.map((item, index) => {
          const matches = invoiceMatches?.[index]
          const topMatch = matches?.[0]

          return (
            <div
              key={`${item.name || ""}-${item.merchant || ""}-${index}`}
              className="flex flex-col gap-1 py-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-row items-start gap-4">
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.name || item.merchant || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                  {item.categoryCode && (
                    <Badge variant="outline" className="text-xs w-fit mt-0.5">{item.categoryCode}</Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-medium ${item.type === "income" ? "text-green-600" : ""}`}>
                    {item.type === "income" ? "+" : ""}{formatCurrency((item.total || 0) * 100, item.currencyCode || data.currencyCode || "EUR")}
                  </div>
                  {item.issuedAt && (
                    <div className="text-xs text-muted-foreground">{String(item.issuedAt).slice(0, 10)}</div>
                  )}
                </div>
              </div>
              {topMatch && (
                <div className="flex items-center gap-1.5 text-xs mt-0.5">
                  <Link2 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Invoice match:</span>
                  <span className="font-medium">{topMatch.invoiceNumber}</span>
                  <span className="text-muted-foreground">({topMatch.clientName})</span>
                  <Badge variant="secondary" className={`text-[10px] px-1 py-0 ${confidenceColor[topMatch.confidence]}`}>
                    {topMatch.confidence}
                  </Badge>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {file && data.items && data.items.length > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSplit} disabled={isSplitting || isSavingAll}>
            {isSplitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Splitting...</>
            ) : (
              <><Split className="w-4 h-4" /> Split into {data.items.length} to review</>
            )}
          </Button>
          <Button onClick={handleSplitAndSaveAll} disabled={isSplitting || isSavingAll}>
            {isSavingAll ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><ArrowDownToLine className="w-4 h-4" /> Save all {data.items.length} transactions</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
