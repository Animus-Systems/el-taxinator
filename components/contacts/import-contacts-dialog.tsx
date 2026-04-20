/**
 * AI-powered contact import dialog.
 *
 * Flow:
 *   1. Upload step — user drops a PDF / CSV / XLSX / image of a business
 *      card or address book. File goes to `POST /api/contacts/extract`
 *      which runs the LLM and returns a list of candidate contacts.
 *      NOTHING is saved yet.
 *   2. Review step — candidate table with a checkbox per row. User ticks
 *      the rows to import and can edit name/email/phone/taxId inline.
 *      Row-level confidence is surfaced as a badge.
 *   3. Commit — ticked rows go through `trpc.contacts.bulkCreate`. On
 *      success the dialog closes and the /contacts list refreshes.
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
import { Loader2, Sparkles, Upload } from "lucide-react"

type ExtractedContact = {
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  province: string | null
  country: string | null
  taxId: string | null
  bankDetails: string | null
  notes: string | null
  role: "client" | "supplier" | "both" | null
  kind: "company" | "person" | null
  confidence: number
}

type ReviewRow = ExtractedContact & {
  selected: boolean
  /** True when a contact with the same taxId OR same normalized name already exists. */
  duplicateOf: string | null
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportContactsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("contacts")
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"upload" | "review">("upload")
  const [uploading, setUploading] = useState(false)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filename, setFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: existing = [] } = trpc.contacts.list.useQuery({}, { enabled: open })

  const bulkCreate = trpc.contacts.bulkCreate.useMutation({
    onSuccess: (result) => {
      toast.success(t("import.successToast", { count: result.created }))
      utils.contacts.list.invalidate()
      handleClose(false)
    },
    onError: (err) => {
      toast.error(err.message || t("import.errorToast"))
    },
  })

  function handleClose(next: boolean) {
    if (!next) {
      setStep("upload")
      setRows([])
      setFilename(null)
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
      const res = await fetch("/api/contacts/extract", { method: "POST", body: fd })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        filename?: string
        contacts?: ExtractedContact[]
      }
      if (!json.success || !json.contacts) {
        setError(json.error || t("import.extractFailed"))
        setUploading(false)
        return
      }
      if (json.contacts.length === 0) {
        setError(t("import.noContactsFound"))
        setUploading(false)
        return
      }
      const existingByTaxId = new Map(
        existing.filter((c) => c.taxId).map((c) => [c.taxId!.trim(), c.id]),
      )
      const existingByName = new Map(
        existing.map((c) => [normalize(c.name), c.id]),
      )
      const reviewed: ReviewRow[] = json.contacts.map((c) => {
        const byTax = c.taxId ? existingByTaxId.get(c.taxId.trim()) ?? null : null
        const byName = byTax ?? existingByName.get(normalize(c.name)) ?? null
        return {
          ...c,
          selected: byName === null,
          duplicateOf: byName,
        }
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

  function handleCommit(): void {
    const payload = rows
      .filter((r) => r.selected)
      .map((r) => ({
        name: r.name.trim(),
        email: r.email,
        phone: r.phone,
        mobile: r.mobile,
        address: r.address,
        city: r.city,
        postalCode: r.postalCode,
        province: r.province,
        country: r.country,
        taxId: r.taxId,
        bankDetails: r.bankDetails,
        notes: r.notes,
        ...(r.role ? { role: r.role } : {}),
        ...(r.kind ? { kind: r.kind } : {}),
      }))
    if (payload.length === 0) {
      toast.error(t("import.pickAtLeastOne"))
      return
    }
    bulkCreate.mutate({ contacts: payload })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
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
              <span>
                {t("import.reviewHint", { filename: filename ?? "" })}
              </span>
              <span className="tabular-nums">
                {t("import.selectedCount", { selected: selectedCount, total: rows.length })}
              </span>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="p-2 text-left font-medium">{t("name")}</th>
                    <th className="p-2 text-left font-medium">{t("taxId")}</th>
                    <th className="p-2 text-left font-medium">{t("email")}</th>
                    <th className="p-2 text-left font-medium">{t("phone")}</th>
                    <th className="p-2 text-left font-medium">{t("city")}</th>
                    <th className="p-2 text-left font-medium">{t("role")}</th>
                    <th className="p-2 text-center font-medium">{t("import.col.confidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={r.duplicateOf ? "bg-amber-500/5" : undefined}
                    >
                      <td className="p-2">
                        <Checkbox
                          checked={r.selected}
                          onCheckedChange={(v) => updateRow(i, { selected: Boolean(v) })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.name}
                          onChange={(e) => updateRow(i, { name: e.target.value })}
                          className="h-8"
                        />
                        {r.duplicateOf ? (
                          <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                            {t("import.duplicateHint")}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.taxId ?? ""}
                          onChange={(e) => updateRow(i, { taxId: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.email ?? ""}
                          onChange={(e) => updateRow(i, { email: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.phone ?? r.mobile ?? ""}
                          onChange={(e) => updateRow(i, { phone: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.city ?? ""}
                          onChange={(e) => updateRow(i, { city: e.target.value || null })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={r.role ?? "client"}
                          onChange={(e) =>
                            updateRow(i, {
                              role: e.target.value as "client" | "supplier" | "both",
                            })
                          }
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="client">{t("roleClient")}</option>
                          <option value="supplier">{t("roleSupplier")}</option>
                          <option value="both">{t("roleBoth")}</option>
                        </select>
                      </td>
                      <td className="p-2 text-center">
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
                  ))}
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
