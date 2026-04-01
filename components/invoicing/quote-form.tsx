"use client"

import { createQuoteAction } from "@/actions/quotes"
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

function generateQuoteNumber() {
  const now = new Date()
  return `PRE-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-001`
}

export function QuoteForm({ clients, products }: Props) {
  const router = useRouter()
  const t = useTranslations("quotes")
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<LineItem[]>([])
  const formRef = useRef<HTMLFormElement>(null)
  const today = format(new Date(), "yyyy-MM-dd")

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

  return (
    <form suppressHydrationWarning ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="number">{t("quoteNumber")}</Label>
          <Input id="number" name="number" defaultValue={generateQuoteNumber()} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="clientId">{t("client")}</Label>
          <Select name="clientId">
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
        <Button type="submit" disabled={isPending}>
          {isPending ? t("creating") : t("createQuote")}
        </Button>
      </div>
    </form>
  )
}
