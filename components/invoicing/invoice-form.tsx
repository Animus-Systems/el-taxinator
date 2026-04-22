
import { createInvoiceAction } from "@/actions/invoices"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Client, Product } from "@/lib/db-types"
import { format } from "date-fns"
import { useRouter } from "@/lib/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"
import { toast } from "sonner"
import { LineItem, LineItemsEditor } from "./line-items-editor"
import { ContactPicker } from "@/components/contacts/contact-picker"
import { CurrencyPicker } from "@/components/currency-picker"
import { InvoicePreviewDialog } from "./invoice-preview-dialog"
import { TemplatesManagerDialog } from "./templates-manager-dialog"

type InvoiceKind = "invoice" | "simplified"

type Props = {
  clients: Client[]
  products: Product[]
  /** Which numbering series this row belongs to. Affects default number
   * prefix ('F' vs 'R') and the `kind` sent to the backend. */
  kind?: InvoiceKind
  /** When provided the form skips `router.push` and hands the new invoice id
   * to the caller — lets a dialog close itself and navigate deliberately. */
  onCreated?: (invoiceId: string) => void
  /** When provided the Cancel button calls this instead of `router.back()`. */
  onCancel?: () => void
}

function generateInvoiceNumber(kind: InvoiceKind) {
  const now = new Date()
  const prefix = kind === "simplified" ? "R" : "F"
  return `${prefix}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-001`
}

export function InvoiceForm({ clients, products, kind = "invoice", onCreated, onCancel }: Props) {
  const router = useRouter()
  const t = useTranslations("invoices")
  const tSettings = useTranslations("settings")
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<LineItem[]>([])
  const [contactId, setContactId] = useState<string>("")
  const [currencyCode, setCurrencyCode] = useState<string>("EUR")
  const formRef = useRef<HTMLFormElement>(null)
  const today = format(new Date(), "yyyy-MM-dd")

  // Seed with the local date stub so the field is never empty. When the server
  // returns the suggestion based on the user's actual last invoice in this
  // series, swap it in — but only if the user hasn't typed over it yet.
  const initialStub = generateInvoiceNumber(kind)
  const [numberValue, setNumberValue] = useState(initialStub)
  const numberTouchedRef = useRef(false)
  const nextNumberQuery = trpc.invoices.nextNumber.useQuery({ kind })
  useEffect(() => {
    if (numberTouchedRef.current) return
    const suggested = nextNumberQuery.data?.number
    if (suggested && suggested !== numberValue) {
      setNumberValue(suggested)
    }
  }, [nextNumberQuery.data, numberValue])

  // Debounced duplicate check — fires ~300ms after the user stops typing
  // so each keystroke doesn't hit the DB. The initial auto-suggested number
  // is guaranteed to be unique (max+1 within the active series), so we only
  // start checking once the user has actually edited the field.
  const [debouncedNumber, setDebouncedNumber] = useState(numberValue)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedNumber(numberValue), 300)
    return () => clearTimeout(id)
  }, [numberValue])
  const dupCheckQuery = trpc.invoices.checkDuplicate.useQuery(
    { number: debouncedNumber },
    { enabled: numberTouchedRef.current && debouncedNumber.trim().length > 0 },
  )
  const numberIsDuplicate = dupCheckQuery.data?.duplicate ?? false

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("items", JSON.stringify(items))

    startTransition(async () => {
      const result = await createInvoiceAction(null, formData)
      if (result.success && result.data) {
        toast.success(t("invoiceCreated"))
        if (onCreated) {
          onCreated(result.data.id)
        } else {
          router.push(`/invoices/${result.data.id}`)
        }
      } else {
        toast.error(result.error || t("failedToCreate"))
      }
    })
  }

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)

  const templatesQuery = trpc.invoiceTemplates.list.useQuery({})
  const templates = templatesQuery.data ?? []
  const [templateId, setTemplateId] = useState<string>("")
  const [templatesManagerOpen, setTemplatesManagerOpen] = useState(false)
  useEffect(() => {
    if (templateId) return
    // Prefer the user-marked default; fall back to the first template so a
    // freshly-created template still gets applied without the user needing
    // to flip the `is_default` switch.
    const def = templates.find((tmpl) => tmpl.isDefault) ?? templates[0]
    if (def) setTemplateId(def.id)
  }, [templates, templateId])
  const activeTemplate = templates.find((tmpl) => tmpl.id === templateId) ?? null

  async function handlePreview() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const payload = {
      number: numberValue,
      kind,
      issueDate: String(fd.get("issueDate") ?? ""),
      dueDate: (fd.get("dueDate") ?? null) || null,
      contactId: contactId || null,
      templateId: templateId || null,
      currencyCode: currencyCode.toUpperCase() || "EUR",
      notes: (fd.get("notes") ?? null) || null,
      irpfRate: Number(fd.get("irpfRate") ?? 0),
      items: items.map((it, index) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        vatRate: it.vatRate,
        position: index,
      })),
    }
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl)
      setPreviewBlobUrl(null)
    }
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const res = await fetch("/api/invoices/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Preview failed (${res.status})`)
      const blob = await res.blob()
      setPreviewBlobUrl(URL.createObjectURL(blob))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("preview.failed", { defaultValue: "Preview failed" }))
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="number">
            {kind === "simplified"
              ? t("simplifiedInvoiceNumber", { defaultValue: "Simplified invoice number" })
              : t("invoiceNumber")}
          </Label>
          <Input
            id="number"
            name="number"
            value={numberValue}
            onChange={(e) => {
              numberTouchedRef.current = true
              setNumberValue(e.target.value)
            }}
            required
            aria-invalid={numberIsDuplicate || undefined}
            className={numberIsDuplicate ? "border-destructive" : undefined}
          />
          {numberIsDuplicate && (
            <p className="text-xs text-destructive">
              {t("numberDuplicate", {
                defaultValue:
                  "This number is already used by another invoice. Pick a different one before saving.",
              })}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>{t("client")}</Label>
          <input type="hidden" name="contactId" value={contactId} />
          <ContactPicker
            contacts={clients}
            value={contactId}
            onChange={setContactId}
            role="client"
            labels={{
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
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
        <div className="space-y-1">
          <Label htmlFor="templateId">{t("template.label", { defaultValue: "Template" })}</Label>
          <input type="hidden" name="templateId" value={templateId} />
          <Select
            value={templateId || "__none__"}
            onValueChange={(v) => setTemplateId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger id="templateId">
              <SelectValue placeholder={t("template.placeholder", { defaultValue: "Default layout" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t("template.none", { defaultValue: "Default layout" })}
              </SelectItem>
              {templates.map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}{tmpl.isDefault ? ` · ${t("template.defaultFlag", { defaultValue: "default" })}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeTemplate ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="inline-block h-3 w-3 rounded-full border"
                style={{ backgroundColor: activeTemplate.accentColor }}
                aria-hidden
              />
              <span>
                {t("template.appliedLabel", { defaultValue: "Applied" })}:{" "}
                {activeTemplate.name} · {activeTemplate.logoPosition} ·{" "}
                {activeTemplate.fontPreset}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("template.noneActive", {
                defaultValue: "No template applied — using default layout.",
              })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setTemplatesManagerOpen(true)}
        >
          {t("template.manage", { defaultValue: "Manage templates" })}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">{t("issueDate")}</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">{t("dueDate")}</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="currencyCode">{t("currency", { defaultValue: "Currency" })}</Label>
          <input type="hidden" name="currencyCode" value={currencyCode} />
          <CurrencyPicker
            id="currencyCode"
            value={currencyCode}
            onChange={setCurrencyCode}
            placeholder={t("currencyPlaceholder", { defaultValue: "EUR" })}
            searchPlaceholder={t("currencySearchPlaceholder", {
              defaultValue: "Search code or name…",
            })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("statusLabel")}</Label>
          <Select name="status" defaultValue="draft">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("draft")}</SelectItem>
              <SelectItem value="sent">{t("sent")}</SelectItem>
              <SelectItem value="paid">{t("paid")}</SelectItem>
              <SelectItem value="overdue">{t("overdue")}</SelectItem>
              <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("lineItems")}</Label>
        <LineItemsEditor
          products={products}
          initialItems={items}
          onChange={setItems}
          currency={currencyCode || "EUR"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="irpfRate">{t("irpfRate")}</Label>
          <Select name="irpfRate" defaultValue="0">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{tSettings("noWithholding")}</SelectItem>
              <SelectItem value="7">{tSettings("newAutonomoRate")}</SelectItem>
              <SelectItem value="15">{tSettings("generalAutonomoRate")}</SelectItem>
              <SelectItem value="19">{tSettings("capitalRate")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{tSettings("irpfDesc")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Input id="notes" name="notes" placeholder={t("paymentTerms")} />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => (onCancel ?? (() => router.back()))()}>
          {t("cancel")}
        </Button>
        <Button type="button" variant="outline" onClick={handlePreview} disabled={previewLoading}>
          {t("preview.cta", { defaultValue: "Preview" })}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("creating") : t("createInvoice")}
        </Button>
      </div>
      <InvoicePreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open)
          if (!open && previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl)
            setPreviewBlobUrl(null)
          }
        }}
        blobUrl={previewBlobUrl}
        loading={previewLoading}
      />
      <TemplatesManagerDialog
        open={templatesManagerOpen}
        onOpenChange={setTemplatesManagerOpen}
      />
    </form>
  )
}
