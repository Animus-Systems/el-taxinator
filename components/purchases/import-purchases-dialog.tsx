/**
 * AI-powered purchase import dialog.
 *
 * Handles three input shapes with one flow:
 *   1. A "libro de facturas recibidas" register (CSV/XLSX/PDF) — many rows.
 *   2. A single supplier invoice (PDF/image) — one row, possibly many items.
 *   3. A receipt (image/PDF) — one row with a summary line.
 *
 * Flow:
 *   Upload → POST /api/purchases/extract (LLM, nothing saved yet) →
 *   Review (editable table) → trpc.purchases.bulkCreate.
 */
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Paperclip, Sparkles, Upload } from "lucide-react"

type ExtractedPurchase = {
  supplierName: string | null
  supplierTaxId: string | null
  supplierInvoiceNumber: string
  issueDate: string | null
  dueDate: string | null
  currencyCode: string | null
  status: "draft" | "received" | "overdue" | "paid" | "cancelled" | "refunded" | null
  irpfRate: number | null
  notes: string | null
  /** Printed grand total (incl. VAT) in major units — overrides item math. */
  totalAmount: number | null
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    vatRate: number
  }>
  confidence: number
}

type ReviewRow = ExtractedPurchase & {
  selected: boolean
  /** True when a purchase with the same supplier + invoice number already exists. */
  duplicateOfId: string | null
}

function rowTotal(row: ExtractedPurchase): number {
  // Prefer the printed total when the extractor captured one — that's the
  // source of truth. Fall back to line-item reconstruction otherwise.
  if (typeof row.totalAmount === "number" && Number.isFinite(row.totalAmount)) {
    return row.totalAmount
  }
  return row.items.reduce(
    (sum, it) => sum + it.quantity * it.unitPrice * (1 + it.vatRate / 100),
    0,
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportPurchasesDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("purchases")
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"upload" | "review">("upload")
  const [uploading, setUploading] = useState(false)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filename, setFilename] = useState<string | null>(null)
  const [sourceFileId, setSourceFileId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: existing = [] } = trpc.purchases.list.useQuery({}, { enabled: open })

  const attachFile = trpc.purchases.attachExistingFile.useMutation({
    onSuccess: () => {
      toast.success(t("import.attachedToExisting"))
      utils.purchases.list.invalidate()
    },
    onError: (err) => toast.error(err.message || t("import.errorToast")),
  })

  const bulkCreate = trpc.purchases.bulkCreate.useMutation({
    onSuccess: (result) => {
      if (result.skipped > 0) {
        toast.success(
          t("import.successToastWithSkipped", {
            count: result.created,
            skipped: result.skipped,
          }),
        )
      } else {
        toast.success(t("import.successToast", { count: result.created }))
      }
      utils.purchases.list.invalidate()
      handleClose(false)
    },
    onError: (err) => {
      toast.error(err.message || t("import.errorToast"))
    },
  })

  function handleClose(next: boolean): void {
    if (!next) {
      setStep("upload")
      setRows([])
      setFilename(null)
      setSourceFileId(null)
      setError(null)
      setUploading(false)
    }
    onOpenChange(next)
  }

  async function handleFile(file: File): Promise<void> {
    setUploading(true)
    setError(null)
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch("/api/purchases/extract", { method: "POST", body: fd })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        filename?: string
        fileId?: string
        purchases?: ExtractedPurchase[]
      }
      if (!json.success || !json.purchases) {
        setError(json.error || t("import.extractFailed"))
        setUploading(false)
        return
      }
      if (json.purchases.length === 0) {
        setError(t("import.noPurchasesFound"))
        setUploading(false)
        return
      }
      setSourceFileId(json.fileId ?? null)

      // Duplicate detection: same supplier_invoice_number on the same contact
      // (or bare invoice number when contact can't be matched).
      const existingKeys = new Map<string, string>()
      for (const p of existing) {
        const supKey = (p.contact?.taxId ?? p.contact?.name ?? "").toLowerCase()
        existingKeys.set(`${supKey}::${p.supplierInvoiceNumber.trim().toLowerCase()}`, p.id)
        existingKeys.set(`::${p.supplierInvoiceNumber.trim().toLowerCase()}`, p.id)
      }

      const reviewed: ReviewRow[] = json.purchases.map((p) => {
        const supKey = (p.supplierTaxId ?? p.supplierName ?? "").toLowerCase()
        const numKey = p.supplierInvoiceNumber.trim().toLowerCase()
        const dup =
          existingKeys.get(`${supKey}::${numKey}`) ??
          existingKeys.get(`::${numKey}`) ??
          null
        return { ...p, selected: dup === null, duplicateOfId: dup }
      })
      setRows(reviewed)
      setFilename(json.filename ?? file.name)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.extractFailed"))
    } finally {
      setUploading(false)
    }
  }

  function updateRow(index: number, patch: Partial<ReviewRow>): void {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const selectedCount = rows.filter((r) => r.selected).length

  // Single-invoice / receipt import that matches an existing purchase:
  // show an "Attach to existing" CTA so users can back-fill missing PDFs.
  const singleDup =
    rows.length === 1 && rows[0]?.duplicateOfId && sourceFileId
      ? { purchaseId: rows[0].duplicateOfId, row: rows[0] }
      : null

  function handleAttachToExisting(): void {
    if (!singleDup || !sourceFileId) return
    attachFile.mutate(
      { purchaseId: singleDup.purchaseId, fileId: sourceFileId },
      { onSuccess: () => handleClose(false) },
    )
  }

  function handleCommit(): void {
    const selected = rows.filter((r) => r.selected && !r.duplicateOfId)
    // Only attach the uploaded source file when the extract lined up as a
    // single-invoice / single-receipt document — otherwise the source is a
    // register and it would be wrong to stamp it onto every new purchase.
    const attachSourceFile = selected.length === 1 && sourceFileId !== null

    // Dedupe within the batch by (supplierKey, supplierInvoiceNumber) so a
    // hallucinated double row doesn't turn into two records.
    const seen = new Set<string>()
    const payload = selected
      .map((r) => {
        const key = `${(r.supplierTaxId ?? r.supplierName ?? "").toLowerCase()}::${r.supplierInvoiceNumber.trim().toLowerCase()}`
        if (seen.has(key)) return null
        seen.add(key)
        return {
          supplierName: r.supplierName,
          supplierTaxId: r.supplierTaxId,
          supplierInvoiceNumber: r.supplierInvoiceNumber.trim(),
          pdfFileId: attachSourceFile ? sourceFileId : null,
          issueDate: r.issueDate ? new Date(r.issueDate) : new Date(),
          dueDate: r.dueDate ? new Date(r.dueDate) : null,
          currencyCode: r.currencyCode ?? "EUR",
          // Preserve the printed grand total so read-back doesn't drift
          // from integer-cent VAT reconstruction (e.g. €36.97 at 7% IGIC).
          totalCents:
            typeof r.totalAmount === "number" && Number.isFinite(r.totalAmount)
              ? Math.round(r.totalAmount * 100)
              : null,
          ...(r.status ? { status: r.status } : {}),
          irpfRate: r.irpfRate ?? 0,
          notes: r.notes,
          items: r.items
            .filter((it) => it.description.trim())
            .map((it) => ({
              description: it.description,
              quantity: it.quantity,
              unitPriceCents: Math.round(it.unitPrice * 100),
              vatRate: it.vatRate,
            })),
        }
      })
      .filter(
        (p): p is NonNullable<typeof p> => p !== null && p.items.length > 0,
      )
    if (payload.length === 0) {
      toast.error(t("import.pickAtLeastOne"))
      return
    }
    bulkCreate.mutate({ purchases: payload })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("import.title")}
          </DialogTitle>
          <DialogDescription>{t("import.subtitle")}</DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/20 p-10 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) void handleFile(f)
              }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">{t("import.dropHere")}</p>
              <p className="text-xs text-muted-foreground">{t("import.formats")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.tsv,.xlsx,.xls,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("import.analyzing")}
                  </>
                ) : (
                  t("import.pickFile")
                )}
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("import.reviewHint", { filename: filename ?? "" })}</span>
              <span className="tabular-nums">
                {t("import.selectedCount", { selected: selectedCount, total: rows.length })}
              </span>
            </div>

            {singleDup && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                <div className="flex items-start gap-2">
                  <Paperclip className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium">{t("import.attachPromptTitle")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("import.attachPromptSubtitle", {
                        number: singleDup.row.supplierInvoiceNumber,
                      })}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAttachToExisting}
                  disabled={attachFile.isPending}
                >
                  {attachFile.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("import.attaching")}
                    </>
                  ) : (
                    t("import.attachToExisting")
                  )}
                </Button>
              </div>
            )}
            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2 text-left font-medium">{t("supplier")}</th>
                    <th className="p-2 text-left font-medium">{t("supplierNumber")}</th>
                    <th className="p-2 text-left font-medium">{t("issueDate")}</th>
                    <th className="p-2 text-right font-medium">{t("total")}</th>
                    <th className="p-2 text-center font-medium">
                      {t("import.col.confidence")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const total = rowTotal(r)
                    return (
                      <tr
                        key={i}
                        className={r.duplicateOfId ? "bg-amber-500/5" : undefined}
                      >
                        <td className="p-2 align-top">
                          <Checkbox
                            checked={r.selected}
                            onCheckedChange={(v) => updateRow(i, { selected: Boolean(v) })}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            value={r.supplierName ?? ""}
                            onChange={(e) =>
                              updateRow(i, { supplierName: e.target.value || null })
                            }
                            className="h-8"
                            placeholder={t("selectSupplier")}
                          />
                          {r.supplierTaxId && (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {r.supplierTaxId}
                            </div>
                          )}
                          {r.duplicateOfId && (
                            <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                              {t("import.duplicateHint")}
                            </div>
                          )}
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            value={r.supplierInvoiceNumber}
                            onChange={(e) =>
                              updateRow(i, { supplierInvoiceNumber: e.target.value })
                            }
                            className="h-8"
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            type="date"
                            value={r.issueDate ?? ""}
                            onChange={(e) =>
                              updateRow(i, { issueDate: e.target.value || null })
                            }
                            className="h-8"
                          />
                        </td>
                        <td className="p-2 text-right align-top tabular-nums">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: r.currencyCode ?? "EUR",
                          }).format(total)}
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {r.items.length} {t("import.linesLabel", {
                              defaultValue: "lines",
                            })}
                          </div>
                        </td>
                        <td className="p-2 text-center align-top">
                          <Badge
                            variant="outline"
                            className={
                              r.confidence >= 0.8
                                ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400 text-[10px]"
                                : r.confidence >= 0.5
                                  ? "border-amber-500/50 text-amber-700 dark:text-amber-400 text-[10px]"
                                  : "border-rose-500/50 text-rose-700 dark:text-rose-400 text-[10px]"
                            }
                          >
                            {Math.round(r.confidence * 100)}%
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "review" ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("upload")
                  setRows([])
                  setFilename(null)
                }}
                disabled={bulkCreate.isPending}
              >
                {t("import.back")}
              </Button>
              <Button
                type="button"
                onClick={handleCommit}
                disabled={bulkCreate.isPending || selectedCount === 0}
              >
                {bulkCreate.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("import.importing")}
                  </>
                ) : (
                  t("import.importSelected", { count: selectedCount })
                )}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
              {t("import.cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
