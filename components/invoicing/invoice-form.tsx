
import { createInvoiceAction } from "@/actions/invoices"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Client, Product } from "@/lib/db-types"
import { format } from "date-fns"
import { useRouter } from "@/lib/navigation"
import { useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { LineItem, LineItemsEditor } from "./line-items-editor"
import { ContactPicker } from "@/components/contacts/contact-picker"

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
  const formRef = useRef<HTMLFormElement>(null)
  const today = format(new Date(), "yyyy-MM-dd")

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
          <Input id="number" name="number" defaultValue={generateInvoiceNumber(kind)} required />
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
          <Input
            id="currencyCode"
            name="currencyCode"
            defaultValue="EUR"
            maxLength={3}
            className="uppercase"
            placeholder="EUR"
            required
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
        <LineItemsEditor products={products} initialItems={items} onChange={setItems} />
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
        <Button type="submit" disabled={isPending}>
          {isPending ? t("creating") : t("createInvoice")}
        </Button>
      </div>
    </form>
  )
}
