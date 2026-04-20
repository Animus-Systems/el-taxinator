/**
 * Multi-file AI invoice import.
 *
 * Flow:
 *   Drop N files →
 *   Queue runs serially (one /api/invoices/extract call in-flight at a time
 *   so we don't overwhelm the AI provider) →
 *   Per-row review (card layout, editable fields + ContactPicker, PDF
 *   preview, duplicate-number warning) →
 *   Save loops /api/invoices/upload-external for each selected row.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Eye,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import { ContactPicker } from "@/components/contacts/contact-picker"
import { PdfPreviewDialog } from "./pdf-preview-dialog"
import type { Contact } from "@/lib/db-types"
import type { InvoiceWithRelations } from "@/models/invoices"

type Suggested = {
  number: string | null
  issueDate: string | null
  dueDate: string | null
  clientName: string | null
  clientTaxId: string | null
  clientAddress: string | null
  clientEmail: string | null
  clientPhone: string | null
  total: number | null
  currency: string | null
  vatRate: number | null
  notes: string | null
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | null
  confidence: number
}

type ExtractResponse =
  | { success: true; fileId: string; fileName: string; suggested: Suggested }
  | { success: false; error: string }

type SaveResponse =
  | { success: true; invoice: { id: string; number: string } }
  | { success: false; error: string }

type InvoiceStatusValue = "draft" | "sent" | "paid" | "overdue" | "cancelled"
const INVOICE_STATUSES: InvoiceStatusValue[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]

type QueueStatus = "queued" | "analyzing" | "extracted" | "failed" | "saved"

type QueueItem = {
  id: string
  file: File
  status: QueueStatus
  error?: string
  fileId?: string
  confidence: number
  // Editable fields (populated from suggested or defaulted)
  number: string
  invoiceStatus: InvoiceStatusValue
  issueDate: string
  dueDate: string
  contactId: string
  total: string
  currencyCode: string
  vatRate: string
  notes: string
  selected: boolean
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function matchContact(contacts: Contact[], s: Suggested): string {
  if (s.clientTaxId) {
    const byTax = contacts.find(
      (c) => c.taxId && c.taxId.toLowerCase() === s.clientTaxId!.toLowerCase(),
    )
    if (byTax) return byTax.id
  }
  if (s.clientName) {
    const byName = contacts.find(
      (c) => c.name.toLowerCase() === s.clientName!.toLowerCase(),
    )
    if (byName) return byName.id
  }
  return ""
}

function itemFromFile(file: File): QueueItem {
  return {
    id: genId(),
    file,
    status: "queued",
    confidence: 0,
    number: "",
    invoiceStatus: "sent",
    issueDate: todayIso(),
    dueDate: "",
    contactId: "",
    total: "",
    currencyCode: "EUR",
    vatRate: "0",
    notes: "",
    selected: true,
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportInvoicesDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("invoices")
  const utils = trpc.useUtils()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [saving, setSaving] = useState(false)
  const runningRef = useRef(false)
  const [preview, setPreview] = useState<{ fileId: string; title: string } | null>(null)

  const { data: contacts = [] } = trpc.contacts.list.useQuery({}, { enabled: open })
  const { data: existing = [] } = trpc.invoices.list.useQuery({}, { enabled: open })

  const dupIdByNumber = useMemo(() => {
    const m = new Map<string, string>()
    for (const inv of existing as InvoiceWithRelations[]) {
      m.set(inv.number.trim().toLowerCase(), inv.id)
    }
    return m
  }, [existing])

  function reset(): void {
    setItems([])
    setSaving(false)
    runningRef.current = false
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleOpenChange(next: boolean): void {
    if (!next) reset()
    onOpenChange(next)
  }

  function addFiles(files: FileList | File[]): void {
    const incoming = Array.from(files).filter((f) => {
      const lower = f.name.toLowerCase()
      return (
        f.type === "application/pdf" ||
        f.type.startsWith("image/") ||
        lower.endsWith(".pdf")
      )
    })
    if (incoming.length === 0) return
    setItems((prev) => [...prev, ...incoming.map(itemFromFile)])
  }

  function updateItem(id: string, patch: Partial<QueueItem>): void {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  function removeItem(id: string): void {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  // Serial queue runner — one extract call in-flight at a time.
  useEffect(() => {
    if (!open) return
    if (runningRef.current) return
    const next = items.find((i) => i.status === "queued")
    if (!next) return

    runningRef.current = true
    const current = next
    void (async () => {
      updateItem(current.id, { status: "analyzing" })
      const fd = new FormData()
      fd.append("file", current.file)
      try {
        const res = await fetch("/api/invoices/extract", { method: "POST", body: fd })
        const json = (await res.json()) as ExtractResponse
        if (!res.ok || !json.success) {
          updateItem(current.id, {
            status: "failed",
            error: json.success === false ? json.error : `Extract failed (${res.status})`,
            selected: false,
          })
        } else {
          const s = json.suggested
          updateItem(current.id, {
            status: "extracted",
            fileId: json.fileId,
            confidence: s.confidence ?? 0,
            number: s.number ?? "",
            issueDate: s.issueDate ?? todayIso(),
            dueDate: s.dueDate ?? "",
            contactId: matchContact(contacts, s),
            total: s.total != null ? String(s.total) : "",
            currencyCode: (s.currency ?? "EUR").toUpperCase(),
            vatRate: s.vatRate != null ? String(s.vatRate) : "0",
            notes: s.notes ?? "",
            invoiceStatus: s.status ?? "sent",
          })
        }
      } catch (err) {
        updateItem(current.id, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          selected: false,
        })
      } finally {
        runningRef.current = false
        // Nudge React to re-evaluate — the effect will pick the next queued.
        setItems((prev) => [...prev])
      }
    })()
  }, [items, open, contacts])

  const stats = useMemo(() => {
    const total = items.length
    const analyzing = items.filter((i) => i.status === "analyzing").length
    const queued = items.filter((i) => i.status === "queued").length
    const extracted = items.filter((i) => i.status === "extracted").length
    const failed = items.filter((i) => i.status === "failed").length
    const saved = items.filter((i) => i.status === "saved").length
    return { total, analyzing, queued, extracted, failed, saved }
  }, [items])

  const selectedCount = items.filter(
    (i) => i.selected && i.status === "extracted",
  ).length

  const queueBusy = stats.analyzing + stats.queued > 0

  async function handleSave(): Promise<void> {
    const toSave = items.filter((i) => i.selected && i.status === "extracted")
    if (toSave.length === 0) {
      toast.error(t("import.pickAtLeastOne"))
      return
    }
    setSaving(true)
    let created = 0
    let failed = 0
    for (const it of toSave) {
      if (!it.fileId) continue
      if (!it.number.trim()) {
        toast.error(t("import.numberRequired", { filename: it.file.name }))
        failed += 1
        continue
      }
      const fd = new FormData()
      fd.append("fileId", it.fileId)
      fd.append("number", it.number.trim())
      // Infer series from the number prefix: R* → factura simplificada,
      // anything else → factura ordinaria. Spain requires separate
      // correlative numbering for each series (RD 1619/2012).
      fd.append("kind", /^R/i.test(it.number.trim()) ? "simplified" : "invoice")
      fd.append("status", it.invoiceStatus)
      fd.append("issueDate", it.issueDate)
      if (it.dueDate) fd.append("dueDate", it.dueDate)
      fd.append("total", it.total || "0")
      fd.append("currencyCode", (it.currencyCode || "EUR").toUpperCase())
      fd.append("vatRate", it.vatRate || "0")
      if (it.contactId) fd.append("contactId", it.contactId)
      if (it.notes) fd.append("notes", it.notes)
      try {
        const res = await fetch("/api/invoices/upload-external", {
          method: "POST",
          body: fd,
        })
        const json = (await res.json()) as SaveResponse
        if (!res.ok || !json.success) {
          failed += 1
          const msg = json.success === false ? json.error : `Save failed (${res.status})`
          toast.error(`${it.file.name}: ${msg}`)
        } else {
          created += 1
          updateItem(it.id, { status: "saved", selected: false })
        }
      } catch (err) {
        failed += 1
        toast.error(
          `${it.file.name}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    setSaving(false)
    if (created > 0) {
      await utils.invoices.list.invalidate()
      const key =
        failed > 0 ? "import.successToastWithFailures" : "import.successToast"
      toast.success(t(key, { count: created, failed }))
    }
    if (failed === 0) handleOpenChange(false)
  }

  const pickerLabels = {
    trigger: t("selectClient"),
    searchPlaceholder: t("clientSearchPlaceholder"),
    createNew: t("clientCreateNew"),
    createNewNamed: t("clientCreateNewNamed", {
      name: "{name}",
      defaultValue: 'Create "{name}"',
    }),
    noneYet: t("noClientsYet", { defaultValue: "No clients yet." }),
    createdToast: t("clientCreated", { defaultValue: "Client created" }),
    createDialogTitle: t("clientCreateNew"),
    createError: t("failedToCreate"),
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("import.title")}
          </DialogTitle>
          <DialogDescription>{t("import.subtitle")}</DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/20 p-6 text-center shrink-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
          }}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm">{t("import.dropHere")}</p>
          <p className="text-xs text-muted-foreground">{t("import.formats")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("import.pickFiles")}
          </Button>
        </div>

        {items.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <span>
              {queueBusy
                ? t("import.queueProgress", {
                    processed: stats.extracted + stats.failed,
                    total: stats.total,
                  })
                : t("import.queueDone", {
                    extracted: stats.extracted,
                    failed: stats.failed,
                    count: stats.failed,
                  })}
            </span>
            <span className="tabular-nums">
              {t("import.selectedCount", {
                selected: selectedCount,
                total: stats.extracted,
              })}
            </span>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2 overflow-y-auto pr-1">
            {items.map((it) => (
              <InvoiceImportCard
                key={it.id}
                item={it}
                contacts={contacts}
                pickerLabels={pickerLabels}
                saving={saving}
                duplicateOfId={dupIdByNumber.get(it.number.trim().toLowerCase()) ?? null}
                onUpdate={(patch) => updateItem(it.id, patch)}
                onRemove={() => removeItem(it.id)}
                onPreview={() => {
                  if (it.fileId) {
                    setPreview({ fileId: it.fileId, title: it.file.name })
                  }
                }}
                t={t}
              />
            ))}
          </div>
        )}

        <DialogFooter className="shrink-0 pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            {t("import.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || queueBusy || selectedCount === 0}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("import.importing")}
              </>
            ) : (
              t("import.importSelected", { count: selectedCount })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <PdfPreviewDialog
        open={preview !== null}
        onOpenChange={(next) => {
          if (!next) setPreview(null)
        }}
        fileId={preview?.fileId ?? null}
        title={preview?.title}
      />
    </Dialog>
  )
}

type TFn = ReturnType<typeof useTranslation>["t"]

type CardProps = {
  item: QueueItem
  contacts: Contact[]
  pickerLabels: Parameters<typeof ContactPicker>[0]["labels"]
  saving: boolean
  duplicateOfId: string | null
  onUpdate: (patch: Partial<QueueItem>) => void
  onRemove: () => void
  onPreview: () => void
  t: TFn
}

function InvoiceImportCard({
  item,
  contacts,
  pickerLabels,
  saving,
  duplicateOfId,
  onUpdate,
  onRemove,
  onPreview,
  t,
}: CardProps) {
  const extracted = item.status === "extracted"
  const editable = extracted && !saving
  const isDuplicate =
    extracted && duplicateOfId !== null && item.number.trim() !== ""

  const cardClass = [
    "rounded-lg border p-3 space-y-2",
    item.status === "failed" ? "border-rose-500/40 bg-rose-500/5" : "",
    item.status === "saved" ? "border-emerald-500/40 bg-emerald-500/5" : "",
    isDuplicate ? "border-amber-500/50 bg-amber-500/5" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={cardClass}>
      {/* Row 1: header */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={item.selected}
          disabled={!extracted || saving}
          onCheckedChange={(v) => onUpdate({ selected: Boolean(v) })}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={item.file.name}>
            {item.file.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {Math.round(item.file.size / 1024)} KB
            {isDuplicate && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {t("import.duplicateHint")}
              </span>
            )}
          </div>
        </div>
        <StatusPill status={item.status} confidence={item.confidence} error={item.error} t={t} />
        {item.fileId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onPreview}
            title={t("viewPdf")}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={item.status === "analyzing" || saving}
          onClick={onRemove}
          aria-label={t("import.remove", { defaultValue: "Remove" })}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Row 2: fields (hidden while queued / analyzing / failed) */}
      {extracted ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_1fr_1.3fr_1fr] md:gap-3 pl-6">
          <Field label={t("import.labels.number")}>
            <Input
              value={item.number}
              disabled={!editable}
              onChange={(e) => onUpdate({ number: e.target.value })}
              className="h-8"
            />
          </Field>
          <Field label={t("import.labels.contact")}>
            <ContactPicker
              contacts={contacts}
              value={item.contactId}
              onChange={(id) => onUpdate({ contactId: id })}
              role="client"
              labels={pickerLabels}
            />
          </Field>
          <Field label={t("import.labels.issueDate")}>
            <Input
              type="date"
              value={item.issueDate}
              disabled={!editable}
              onChange={(e) => onUpdate({ issueDate: e.target.value })}
              className="h-8"
            />
          </Field>
          <Field label={t("import.labels.total")}>
            <div className="flex gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={item.total}
                disabled={!editable}
                onChange={(e) => onUpdate({ total: e.target.value })}
                className="h-8 text-right"
              />
              <Input
                value={item.currencyCode}
                disabled={!editable}
                onChange={(e) =>
                  onUpdate({
                    currencyCode: e.target.value.toUpperCase().slice(0, 3),
                  })
                }
                className="h-8 w-16 uppercase"
                maxLength={3}
                placeholder="EUR"
                aria-label={t("import.labels.currency", { defaultValue: "Currency" })}
                title={t("import.labels.currency", { defaultValue: "Currency" })}
              />
            </div>
          </Field>
          <Field label={t("import.labels.invoiceStatus")}>
            <Select
              value={item.invoiceStatus}
              disabled={!editable}
              onValueChange={(v) =>
                onUpdate({ invoiceStatus: v as InvoiceStatusValue })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(s, { defaultValue: s })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : item.status === "failed" && item.error ? (
        <p className="pl-6 text-xs text-rose-700 dark:text-rose-400">{item.error}</p>
      ) : null}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function StatusPill({
  status,
  confidence,
  error,
  t,
}: {
  status: QueueStatus
  confidence: number
  error?: string | undefined
  t: TFn
}) {
  if (status === "queued") {
    return (
      <Badge variant="outline" className="text-[10px]">
        {t("import.status.queued")}
      </Badge>
    )
  }
  if (status === "analyzing") {
    return (
      <Badge variant="outline" className="text-[10px]">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        {t("import.status.analyzing")}
      </Badge>
    )
  }
  if (status === "saved") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400 text-[10px]"
      >
        <Check className="mr-1 h-3 w-3" />
        {t("import.status.saved")}
      </Badge>
    )
  }
  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="border-rose-500/50 text-rose-700 dark:text-rose-400 text-[10px]"
        title={error}
      >
        <AlertCircle className="mr-1 h-3 w-3" />
        {t("import.status.failed")}
      </Badge>
    )
  }
  // extracted
  const conf = Math.round(confidence * 100)
  return (
    <Badge
      variant="outline"
      className={
        confidence >= 0.8
          ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400 text-[10px]"
          : confidence >= 0.5
            ? "border-amber-500/50 text-amber-700 dark:text-amber-400 text-[10px]"
            : "border-rose-500/50 text-rose-700 dark:text-rose-400 text-[10px]"
      }
    >
      {conf}%
    </Badge>
  )
}
