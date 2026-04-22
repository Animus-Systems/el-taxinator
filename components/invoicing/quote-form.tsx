
import { createQuoteAction } from "@/actions/quotes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Client, Product } from "@/lib/db-types"
import { format } from "date-fns"
import { useRouter } from "@/lib/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"
import { toast } from "sonner"
import { LineItem, LineItemsEditor } from "./line-items-editor"
import { ContactPicker } from "@/components/contacts/contact-picker"
import { InvoicePreviewDialog } from "./invoice-preview-dialog"
import { TemplatesManagerDialog } from "./templates-manager-dialog"

type Props = {
  clients: Client[]
  products: Product[]
}

function generateQuoteNumber() {
  const now = new Date()
  return `PRE-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}-001`
}

export function QuoteForm({ clients, products }: Props) {
  const router = useRouter()
  const t = useTranslations("quotes")
  const tInvoices = useTranslations("invoices")
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<LineItem[]>([])
  const [contactId, setContactId] = useState<string>("")
  const [numberValue, setNumberValue] = useState(generateQuoteNumber())
  const formRef = useRef<HTMLFormElement>(null)
  const today = format(new Date(), "yyyy-MM-dd")

  // Template picker — shares the invoice_templates list, renders with a
  // QUOTE-flavored title override server-side so one set of templates can
  // drive both invoices and quotes.
  const templatesQuery = trpc.invoiceTemplates.list.useQuery({})
  const templates = templatesQuery.data ?? []
  const [templateId, setTemplateId] = useState<string>("")
  useEffect(() => {
    if (templateId) return
    const def = templates.find((tmpl) => tmpl.isDefault) ?? templates[0]
    if (def) setTemplateId(def.id)
  }, [templates, templateId])
  const activeTemplate = templates.find((tmpl) => tmpl.id === templateId) ?? null
  const [templatesManagerOpen, setTemplatesManagerOpen] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("items", JSON.stringify(items))

    startTransition(async () => {
      const result = await createQuoteAction(null, formData)
      if (result.success && result.data) {
        toast.success(t("quoteCreated"))
        router.push(`/quotes/${result.data.id}`)
      } else {
        toast.error(result.error || t("failedToCreate"))
      }
    })
  }

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)

  async function handlePreview() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const payload = {
      number: numberValue,
      issueDate: String(fd.get("issueDate") ?? ""),
      expiryDate: (fd.get("expiryDate") ?? null) || null,
      contactId: contactId || null,
      templateId: templateId || null,
      notes: (fd.get("notes") ?? null) || null,
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
      const res = await fetch("/api/quotes/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Preview failed (${res.status})`)
      const blob = await res.blob()
      setPreviewBlobUrl(URL.createObjectURL(blob))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tInvoices("preview.failed", { defaultValue: "Preview failed" }),
      )
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="number">{t("quoteNumber")}</Label>
          <Input
            id="number"
            name="number"
            value={numberValue}
            onChange={(e) => setNumberValue(e.target.value)}
            required
          />
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
              searchPlaceholder: tInvoices("clientSearchPlaceholder", {
                defaultValue: "Search by name, tax ID, or city",
              }),
              createNew: tInvoices("clientCreateNew", { defaultValue: "Add new contact" }),
              createNewNamed: tInvoices("clientCreateNewNamed", {
                name: "{name}",
                defaultValue: 'Add "{name}" as a new contact',
              }),
              noneYet: tInvoices("noClientsYet", { defaultValue: "No contacts yet." }),
              createdToast: tInvoices("clientCreated", { defaultValue: "Contact created" }),
              createDialogTitle: tInvoices("clientCreateNew", {
                defaultValue: "Add new contact",
              }),
              createError: tInvoices("failedToCreate", { defaultValue: "Failed to create" }),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
        <div className="space-y-1">
          <Label htmlFor="templateId">
            {tInvoices("template.label", { defaultValue: "Template" })}
          </Label>
          <input type="hidden" name="templateId" value={templateId} />
          <Select
            value={templateId || "__none__"}
            onValueChange={(v) => setTemplateId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger id="templateId">
              <SelectValue
                placeholder={tInvoices("template.placeholder", {
                  defaultValue: "Default layout",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {tInvoices("template.none", { defaultValue: "Default layout" })}
              </SelectItem>
              {templates.map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                  {tmpl.isDefault
                    ? ` · ${tInvoices("template.defaultFlag", { defaultValue: "default" })}`
                    : ""}
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
                {tInvoices("template.appliedLabel", { defaultValue: "Applied" })}:{" "}
                {activeTemplate.name} · {activeTemplate.logoPosition} ·{" "}
                {activeTemplate.fontPreset}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {tInvoices("template.noneActive", {
                defaultValue: "No template applied — using default layout.",
              })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("template.quoteHint", {
              defaultValue: "Uses your invoice templates — rendered as a QUOTE.",
            })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setTemplatesManagerOpen(true)}
        >
          {tInvoices("template.manage", { defaultValue: "Manage templates" })}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">{t("issueDate")}</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expiryDate">{t("expiryDate")}</Label>
          <Input id="expiryDate" name="expiryDate" type="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("status")}</Label>
          <Select name="status" defaultValue="draft">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("draft")}</SelectItem>
              <SelectItem value="sent">{t("sent")}</SelectItem>
              <SelectItem value="accepted">{t("accepted")}</SelectItem>
              <SelectItem value="rejected">{t("rejected")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("lineItems")}</Label>
        <LineItemsEditor products={products} onChange={setItems} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input id="notes" name="notes" placeholder={t("notesPlaceholder")} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handlePreview}
          disabled={previewLoading}
        >
          {tInvoices("preview.cta", { defaultValue: "Preview" })}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("creating") : t("createQuote")}
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
        title={t("quotePreviewTitle", { defaultValue: "Quote preview" })}
      />
      <TemplatesManagerDialog
        open={templatesManagerOpen}
        onOpenChange={setTemplatesManagerOpen}
      />
    </form>
  )
}
