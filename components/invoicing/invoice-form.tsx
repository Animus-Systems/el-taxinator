
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

type Props = {
  clients: Client[]
  products: Product[]
}

function generateInvoiceNumber() {
  const now = new Date()
  return `F-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-001`
}

export function InvoiceForm({ clients, products }: Props) {
  const router = useRouter()
  const t = useTranslations("invoices")
  const tSettings = useTranslations("settings")
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<LineItem[]>([])
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
        router.push(`/invoices/${result.data.id}`)
      } else {
        toast.error(result.error || t("failedToCreate"))
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="number">{t("invoiceNumber")}</Label>
          <Input id="number" name="number" defaultValue={generateInvoiceNumber()} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contactId">{t("client")}</Label>
          <Select name="contactId">
            <SelectTrigger>
              <SelectValue placeholder={t("selectClient")} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">{t("issueDate")}</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">{t("dueDate")}</Label>
          <Input id="dueDate" name="dueDate" type="date" />
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
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("creating") : t("createInvoice")}
        </Button>
      </div>
    </form>
  )
}
