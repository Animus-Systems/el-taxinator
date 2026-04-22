import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRouter } from "@/lib/navigation"
import { trpc } from "~/trpc"
import type {
  InvoiceTemplate,
  InvoiceTemplateLabels,
  LogoPosition,
  FontPreset,
  TemplateLanguage,
} from "@/lib/db-types"

/**
 * Keys the UI exposes as rename-able labels. Matches the renderer's
 * defaults. Extra keys in the stored labels jsonb pass through harmlessly.
 */
const LABEL_KEYS = [
  "invoiceTitle",
  "issueDate",
  "dueDate",
  "billTo",
  "description",
  "qty",
  "unitPrice",
  "vatPercent",
  "amount",
  "subtotal",
  "vat",
  "irpfRetention",
  "totalToPay",
  "prominentTotal",
  "notes",
  "bankDetails",
  "watermarkDraft",
  "watermarkCancelled",
  "watermarkRejected",
] as const
type LabelKey = (typeof LABEL_KEYS)[number]

/** Placeholder hints shown in each label-override input when empty. */
const DEFAULT_LABEL_HINTS: Record<LabelKey, string> = {
  invoiceTitle: "INVOICE",
  issueDate: "Issue Date",
  dueDate: "Due Date",
  billTo: "Bill To",
  description: "Description",
  qty: "Qty",
  unitPrice: "Unit Price",
  vatPercent: "VAT %",
  amount: "Amount",
  subtotal: "Subtotal",
  vat: "VAT",
  irpfRetention: "Ret. IRPF",
  totalToPay: "TOTAL",
  prominentTotal: "Total",
  notes: "Notes",
  bankDetails: "Bank details",
  watermarkDraft: "DRAFT",
  watermarkCancelled: "CANCELLED",
  watermarkRejected: "REJECTED",
}

function defaultLabelHintFor(key: LabelKey): string {
  return DEFAULT_LABEL_HINTS[key]
}

type Mode = { kind: "create" } | { kind: "edit"; template: InvoiceTemplate }

type Props = {
  mode: Mode
  /** Called after a successful create / update / delete / cancel. Used by
   *  the dialog host to return to the list. Falls back to a route push
   *  when absent, preserving behavior for any legacy page routes. */
  onDone?: () => void
}

type FormState = {
  name: string
  isDefault: boolean
  logoFileId: string | null
  logoPosition: LogoPosition
  accentColor: string
  fontPreset: FontPreset
  headerText: string
  footerText: string
  bankDetailsText: string
  businessDetailsText: string
  belowTotalsText: string
  showProminentTotal: boolean
  showVatColumn: boolean
  showBankDetails: boolean
  paymentTermsDays: string
  language: TemplateLanguage
  labels: Record<LabelKey, string>
}

function emptyLabels(): Record<LabelKey, string> {
  return LABEL_KEYS.reduce((acc, key) => {
    acc[key] = ""
    return acc
  }, {} as Record<LabelKey, string>)
}

function labelsFromStored(stored: InvoiceTemplateLabels | null): Record<LabelKey, string> {
  const out = emptyLabels()
  if (!stored) return out
  for (const key of LABEL_KEYS) {
    const v = stored[key]
    if (typeof v === "string") out[key] = v
  }
  return out
}

function initialState(mode: Mode): FormState {
  if (mode.kind === "edit") {
    const t = mode.template
    return {
      name: t.name,
      isDefault: t.isDefault,
      logoFileId: t.logoFileId,
      logoPosition: t.logoPosition,
      accentColor: t.accentColor,
      fontPreset: t.fontPreset,
      headerText: t.headerText ?? "",
      footerText: t.footerText ?? "",
      bankDetailsText: t.bankDetailsText ?? "",
      businessDetailsText: t.businessDetailsText ?? "",
      belowTotalsText: t.belowTotalsText ?? "",
      showProminentTotal: t.showProminentTotal,
      showVatColumn: t.showVatColumn,
      showBankDetails: t.showBankDetails,
      paymentTermsDays: t.paymentTermsDays != null ? String(t.paymentTermsDays) : "",
      language: t.language,
      labels: labelsFromStored(t.labels),
    }
  }
  return {
    name: "",
    isDefault: false,
    logoFileId: null,
    logoPosition: "left",
    accentColor: "#4f46e5",
    fontPreset: "helvetica",
    headerText: "",
    footerText: "",
    bankDetailsText: "",
    businessDetailsText: "",
    belowTotalsText: "",
    showProminentTotal: false,
    showVatColumn: true,
    showBankDetails: false,
    paymentTermsDays: "",
    language: "es",
    labels: emptyLabels(),
  }
}

export function TemplateForm({ mode, onDone }: Props) {
  const navigateDone = () => {
    if (onDone) onDone()
    else router.push("/invoices/templates")
  }
  const router = useRouter()
  const { t } = useTranslation("invoices")
  const [state, setState] = useState<FormState>(() => initialState(mode))
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const utils = trpc.useUtils()
  const createMut = trpc.invoiceTemplates.create.useMutation()
  const updateMut = trpc.invoiceTemplates.update.useMutation()
  const deleteMut = trpc.invoiceTemplates.delete.useMutation()

  useEffect(() => {
    setState(initialState(mode))
    // Only re-init when switching between edit targets, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind === "edit" ? mode.template.id : null])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  async function handleLogoUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      // The existing /api/invoices/extract route persists a file and returns
      // its fileId, but it also runs LLM extraction. For logo upload we want
      // a simpler path — reuse attach-pdf logic by adapting to a minimal
      // endpoint. For now, inline-upload via the files compat endpoint.
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const body = (await res.json()) as { files?: { id: string; filename: string }[] }
      const uploadedId = body.files?.[0]?.id
      if (!uploadedId) throw new Error("No file returned")
      update("logoFileId", uploadedId)
      toast.success(t("template.logoUploaded", { defaultValue: "Logo uploaded" }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedName = state.name.trim()
    if (!trimmedName) {
      toast.error(t("template.errors.nameRequired", { defaultValue: "Name is required" }))
      return
    }
    const paymentTermsDaysParsed = state.paymentTermsDays.trim() === ""
      ? null
      : Number.parseInt(state.paymentTermsDays, 10)
    if (paymentTermsDaysParsed != null && (!Number.isFinite(paymentTermsDaysParsed) || paymentTermsDaysParsed < 0)) {
      toast.error(t("template.errors.paymentTermsInvalid", { defaultValue: "Payment terms must be a positive number" }))
      return
    }

    // Drop label entries that are empty strings — the renderer falls back
    // to its defaults for any key missing from the jsonb blob.
    const trimmedLabels = Object.entries(state.labels).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const t = value.trim()
        if (t) acc[key] = t
        return acc
      },
      {},
    )
    const labelsPayload = Object.keys(trimmedLabels).length > 0 ? trimmedLabels : null

    const payload = {
      name: trimmedName,
      isDefault: state.isDefault,
      logoFileId: state.logoFileId,
      logoPosition: state.logoPosition,
      accentColor: state.accentColor,
      fontPreset: state.fontPreset,
      headerText: state.headerText.trim() || null,
      footerText: state.footerText.trim() || null,
      bankDetailsText: state.bankDetailsText.trim() || null,
      businessDetailsText: state.businessDetailsText.trim() || null,
      belowTotalsText: state.belowTotalsText.trim() || null,
      showProminentTotal: state.showProminentTotal,
      showVatColumn: state.showVatColumn,
      labels: labelsPayload,
      showBankDetails: state.showBankDetails,
      paymentTermsDays: paymentTermsDaysParsed,
      language: state.language,
    }

    startTransition(async () => {
      try {
        if (mode.kind === "create") {
          await createMut.mutateAsync(payload)
          toast.success(t("template.created", { defaultValue: "Template created" }))
        } else {
          await updateMut.mutateAsync({ id: mode.template.id, ...payload })
          toast.success(t("template.updated", { defaultValue: "Template updated" }))
        }
        await utils.invoiceTemplates.list.invalidate()
        navigateDone()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed")
      }
    })
  }

  async function handleDelete() {
    if (mode.kind !== "edit") return
    if (!confirm(t("template.confirmDelete", { defaultValue: "Delete this template? Invoices using it will fall back to the default layout." }))) {
      return
    }
    try {
      await deleteMut.mutateAsync({ id: mode.template.id })
      await utils.invoiceTemplates.list.invalidate()
      toast.success(t("template.deleted", { defaultValue: "Template deleted" }))
      navigateDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    }
  }

  // ── Live side-by-side preview ──────────────────────────────────────────
  // Debounce the form state, then POST it to the template-preview endpoint
  // so every tweak (color, logo position, label override) re-renders the
  // sample PDF on the right without saving.
  const [debouncedState, setDebouncedState] = useState(state)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedState(state), 500)
    return () => clearTimeout(id)
  }, [state])

  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    previewAbortRef.current?.abort()
    const abort = new AbortController()
    previewAbortRef.current = abort

    const payload = {
      name: debouncedState.name || "preview",
      logoFileId: debouncedState.logoFileId,
      logoPosition: debouncedState.logoPosition,
      accentColor: debouncedState.accentColor,
      fontPreset: debouncedState.fontPreset,
      headerText: debouncedState.headerText.trim() || null,
      footerText: debouncedState.footerText.trim() || null,
      bankDetailsText: debouncedState.bankDetailsText.trim() || null,
      businessDetailsText: debouncedState.businessDetailsText.trim() || null,
      belowTotalsText: debouncedState.belowTotalsText.trim() || null,
      showProminentTotal: debouncedState.showProminentTotal,
      showVatColumn: debouncedState.showVatColumn,
      labels: Object.fromEntries(
        Object.entries(debouncedState.labels).filter(([, v]) => v.trim().length > 0),
      ),
      showBankDetails: debouncedState.showBankDetails,
      paymentTermsDays:
        debouncedState.paymentTermsDays.trim() === ""
          ? null
          : Number.parseInt(debouncedState.paymentTermsDays, 10) || null,
      language: debouncedState.language,
    }

    setPreviewLoading(true)
    fetch("/api/invoice-templates/preview-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Preview failed (${res.status})`)
        return res.blob()
      })
      .then((blob) => {
        if (abort.signal.aborted) return
        setPreviewBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(blob)
        })
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return
        // eslint-disable-next-line no-console
        console.warn("[template-preview]", err)
      })
      .finally(() => {
        if (!abort.signal.aborted) setPreviewLoading(false)
      })
    return () => {
      abort.abort()
    }
  }, [debouncedState])

  // Clean up the final blob when the form unmounts.
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="tmpl-name">{t("template.fields.name", { defaultValue: "Name" })}</Label>
          <Input
            id="tmpl-name"
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            required
            maxLength={100}
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch
            id="tmpl-default"
            checked={state.isDefault}
            onCheckedChange={(v) => update("isDefault", v)}
          />
          <Label htmlFor="tmpl-default">
            {t("template.fields.isDefault", { defaultValue: "Default for new invoices" })}
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="tmpl-logo-position">
            {t("template.fields.logoPosition", { defaultValue: "Logo position" })}
          </Label>
          <Select
            value={state.logoPosition}
            onValueChange={(v) => update("logoPosition", v as LogoPosition)}
          >
            <SelectTrigger id="tmpl-logo-position">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">
                {t("template.fields.logoLeft", { defaultValue: "Left" })}
              </SelectItem>
              <SelectItem value="right">
                {t("template.fields.logoRight", { defaultValue: "Right" })}
              </SelectItem>
              <SelectItem value="center">
                {t("template.fields.logoCenter", { defaultValue: "Center" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tmpl-accent">
            {t("template.fields.accentColor", { defaultValue: "Accent color" })}
          </Label>
          <Input
            id="tmpl-accent"
            type="color"
            value={state.accentColor}
            onChange={(e) => update("accentColor", e.target.value)}
            className="h-10 w-full p-1"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tmpl-font">
            {t("template.fields.fontPreset", { defaultValue: "Font preset" })}
          </Label>
          <Select
            value={state.fontPreset}
            onValueChange={(v) => update("fontPreset", v as FontPreset)}
          >
            <SelectTrigger id="tmpl-font">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="helvetica">Helvetica</SelectItem>
              <SelectItem value="times">Times</SelectItem>
              <SelectItem value="courier">Courier</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>{t("template.fields.logo", { defaultValue: "Logo" })}</Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleLogoUpload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? t("template.logoUploading", { defaultValue: "Uploading…" })
              : state.logoFileId
                ? t("template.logoReplace", { defaultValue: "Replace logo" })
                : t("template.logoUpload", { defaultValue: "Upload logo" })}
          </Button>
          {state.logoFileId && (
            <Button type="button" variant="ghost" onClick={() => update("logoFileId", null)}>
              {t("template.logoRemove", { defaultValue: "Remove logo" })}
            </Button>
          )}
          {state.logoFileId && (
            <img
              src={`/files/view/${state.logoFileId}`}
              alt="logo"
              className="h-10 w-auto rounded border"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="tmpl-language">
            {t("template.fields.language", { defaultValue: "Language" })}
          </Label>
          <Select
            value={state.language}
            onValueChange={(v) => update("language", v as TemplateLanguage)}
          >
            <SelectTrigger id="tmpl-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tmpl-payment-terms">
            {t("template.fields.paymentTermsDays", { defaultValue: "Payment terms (days)" })}
          </Label>
          <Input
            id="tmpl-payment-terms"
            type="number"
            min={0}
            max={365}
            value={state.paymentTermsDays}
            onChange={(e) => update("paymentTermsDays", e.target.value)}
            placeholder="30"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tmpl-business-details">
          {t("template.fields.businessDetails", { defaultValue: "Business details block" })}
        </Label>
        <Textarea
          id="tmpl-business-details"
          value={state.businessDetailsText}
          onChange={(e) => update("businessDetailsText", e.target.value)}
          rows={5}
          placeholder={t("template.fields.businessDetailsPlaceholder", {
            defaultValue:
              "One line per row. First line is shown in bold. Overrides your default business info when set.",
          })}
        />
        <p className="text-xs text-muted-foreground">
          {t("template.fields.businessDetailsHint", {
            defaultValue:
              "Shown opposite the logo. Falls back to your account's business name / address / tax ID when blank.",
          })}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tmpl-header">
          {t("template.fields.headerText", { defaultValue: "Header text" })}
        </Label>
        <Textarea
          id="tmpl-header"
          value={state.headerText}
          onChange={(e) => update("headerText", e.target.value)}
          rows={2}
          placeholder={t("template.fields.headerTextPlaceholder", { defaultValue: "Shown above the line items" })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="tmpl-below-totals">
          {t("template.fields.belowTotalsText", { defaultValue: "Below-totals text" })}
        </Label>
        <Textarea
          id="tmpl-below-totals"
          value={state.belowTotalsText}
          onChange={(e) => update("belowTotalsText", e.target.value)}
          rows={3}
          placeholder={t("template.fields.belowTotalsPlaceholder", {
            defaultValue:
              "Italic block under the totals — e.g. currency conversion info, exchange rate source.",
          })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="tmpl-footer">
          {t("template.fields.footerText", { defaultValue: "Footer text" })}
        </Label>
        <Textarea
          id="tmpl-footer"
          value={state.footerText}
          onChange={(e) => update("footerText", e.target.value)}
          rows={4}
          placeholder={t("template.fields.footerTextPlaceholder", {
            defaultValue:
              "Centered multi-line footer — legal notice, payment instructions, thank-you.",
          })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="tmpl-show-bank"
            checked={state.showBankDetails}
            onCheckedChange={(v) => update("showBankDetails", v)}
          />
          <Label htmlFor="tmpl-show-bank">
            {t("template.fields.showBankDetails", { defaultValue: "Show bank details block" })}
          </Label>
        </div>
        {state.showBankDetails && (
          <Textarea
            value={state.bankDetailsText}
            onChange={(e) => update("bankDetailsText", e.target.value)}
            rows={3}
            placeholder={t("template.fields.bankDetailsPlaceholder", { defaultValue: "IBAN, BIC, bank name…" })}
          />
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          {t("template.sections.display", { defaultValue: "Display" })}
        </h3>
        <div className="flex items-center gap-2">
          <Switch
            id="tmpl-show-prominent-total"
            checked={state.showProminentTotal}
            onCheckedChange={(v) => update("showProminentTotal", v)}
          />
          <Label htmlFor="tmpl-show-prominent-total">
            {t("template.fields.showProminentTotal", {
              defaultValue: "Show prominent total next to dates",
            })}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="tmpl-show-vat-column"
            checked={state.showVatColumn}
            onCheckedChange={(v) => update("showVatColumn", v)}
          />
          <Label htmlFor="tmpl-show-vat-column">
            {t("template.fields.showVatColumn", {
              defaultValue: "Show VAT column in the items table",
            })}
          </Label>
        </div>
      </div>

      <details className="space-y-3 rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("template.sections.labels", {
            defaultValue: "Label overrides (leave blank to keep defaults)",
          })}
        </summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {LABEL_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`tmpl-label-${key}`} className="text-xs">
                {t(`template.labels.${key}`, { defaultValue: key })}
              </Label>
              <Input
                id={`tmpl-label-${key}`}
                value={state.labels[key]}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    labels: { ...prev.labels, [key]: e.target.value },
                  }))
                }
                placeholder={t(`template.labels.${key}Placeholder`, {
                  defaultValue: defaultLabelHintFor(key),
                })}
              />
            </div>
          ))}
        </div>
      </details>

      <div className="flex justify-between items-center">
        <div>
          {mode.kind === "edit" && (
            <Button type="button" variant="destructive" onClick={handleDelete}>
              {t("template.delete", { defaultValue: "Delete template" })}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={navigateDone}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? t("template.saving", { defaultValue: "Saving…" })
              : mode.kind === "create"
                ? t("template.create", { defaultValue: "Create template" })
                : t("template.save", { defaultValue: "Save template" })}
          </Button>
        </div>
      </div>
    </form>
      <aside className="xl:sticky xl:top-6 xl:self-start space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t("template.livePreview", { defaultValue: "Live preview" })}
          </h3>
          {previewLoading && (
            <span className="text-xs text-muted-foreground">
              {t("template.previewRefreshing", { defaultValue: "Refreshing…" })}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("template.previewHint", {
            defaultValue:
              "Rendered with sample data. Saving isn't required — changes re-render automatically.",
          })}
        </p>
        <div className="rounded-md border bg-muted/20 overflow-hidden" style={{ height: "80vh" }}>
          {previewBlobUrl ? (
            <iframe
              src={previewBlobUrl}
              className="w-full h-full"
              title={t("template.livePreview", { defaultValue: "Live preview" })}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {t("template.previewLoading", { defaultValue: "Loading preview…" })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
