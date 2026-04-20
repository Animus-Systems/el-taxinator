import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { format } from "date-fns"
import { trpc } from "~/trpc"
import { useRouter } from "@/lib/navigation"
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
import { LineItem, LineItemsEditor } from "@/components/invoicing/line-items-editor"
import { ContactPicker } from "@/components/contacts/contact-picker"
import { Loader2, Paperclip, Upload, X } from "lucide-react"
import type { Contact, Currency, Product } from "@/lib/db-types"

type Props = {
  contacts: Contact[]
  products: Product[]
  currencies: Currency[]
  /** When given: controls navigation. If omitted, the form falls back to routing. */
  onCreated?: (purchaseId: string) => void
  onCancel?: () => void
}

export function PurchaseForm({
  contacts,
  products,
  currencies,
  onCreated,
  onCancel,
}: Props) {
  const { t } = useTranslation("purchases")
  const router = useRouter()
  const utils = trpc.useUtils()

  const today = format(new Date(), "yyyy-MM-dd")
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("")
  const [contactId, setContactId] = useState<string>("")
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate, setDueDate] = useState<string>("")
  const [status, setStatus] = useState("received")
  const [irpfRate, setIrpfRate] = useState("0")
  const [currencyCode, setCurrencyCode] = useState("EUR")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<LineItem[]>([])
  const [pdfFileId, setPdfFileId] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(file: File): Promise<void> {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/files/upload", { method: "POST", body: fd })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        files?: { id: string; filename: string }[]
      }
      if (!json.success || !json.files?.[0]) {
        toast.error(json.error || t("attach.uploadFailed"))
        return
      }
      setPdfFileId(json.files[0].id)
      setPdfFilename(json.files[0].filename)
      toast.success(t("attach.uploadSuccess"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("attach.uploadFailed"))
    } finally {
      setUploading(false)
    }
  }

  const createPurchase = trpc.purchases.create.useMutation({
    onSuccess: (purchase) => {
      utils.purchases.list.invalidate()
      toast.success(t("created"))
      if (onCreated) onCreated(purchase.id)
      else router.push(`/purchases/${purchase.id}`)
    },
    onError: (err) => {
      toast.error(err.message || t("failedToCreate"))
    },
  })

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    if (!supplierInvoiceNumber.trim()) {
      toast.error(t("supplierNumberRequired"))
      return
    }
    if (items.length === 0 || items.every((it) => !it.description.trim())) {
      toast.error(t("itemsRequired"))
      return
    }
    createPurchase.mutate({
      supplierInvoiceNumber: supplierInvoiceNumber.trim(),
      contactId: contactId || null,
      pdfFileId: pdfFileId ?? null,
      issueDate: new Date(issueDate),
      dueDate: dueDate ? new Date(dueDate) : null,
      status,
      currencyCode,
      irpfRate: Number(irpfRate) || 0,
      notes: notes || null,
      items: items
        .filter((it) => it.description.trim())
        .map((it, idx) => ({
          productId: it.productId ?? null,
          description: it.description,
          quantity: it.quantity,
          unitPrice: Math.round(it.unitPrice),
          vatRate: it.vatRate,
          position: idx,
        })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="supplierInvoiceNumber">{t("supplierNumber")}</Label>
          <Input
            id="supplierInvoiceNumber"
            value={supplierInvoiceNumber}
            onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
            placeholder={t("supplierNumberPlaceholder")}
            required
          />
          <p className="text-xs text-muted-foreground">{t("supplierNumberHint")}</p>
        </div>
        <div className="space-y-1">
          <Label>{t("supplier")}</Label>
          <ContactPicker
            contacts={contacts}
            value={contactId}
            onChange={setContactId}
            role="supplier"
            labels={{
              trigger: t("selectSupplier"),
              searchPlaceholder: t("supplierSearchPlaceholder"),
              createNew: t("supplierCreateNew"),
              createNewNamed: t("supplierCreateNewNamed", {
                name: "{name}",
                defaultValue: 'Create "{name}"',
              }),
              noneYet: t("noSuppliersYet", { defaultValue: "No suppliers yet." }),
              createdToast: t("supplierCreated", { defaultValue: "Supplier created" }),
              createDialogTitle: t("supplierCreateNew"),
              createError: t("attach.uploadFailed"),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="issueDate">{t("issueDate")}</Label>
          <Input
            id="issueDate"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dueDate">{t("dueDate")}</Label>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">{t("status")}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("statuses.draft")}</SelectItem>
              <SelectItem value="received">{t("statuses.received")}</SelectItem>
              <SelectItem value="overdue">{t("statuses.overdue")}</SelectItem>
              <SelectItem value="paid">{t("statuses.paid")}</SelectItem>
              <SelectItem value="cancelled">{t("statuses.cancelled")}</SelectItem>
              <SelectItem value="refunded">{t("statuses.refunded")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label htmlFor="currencyCode">{t("currency")}</Label>
          <Select value={currencyCode} onValueChange={setCurrencyCode}>
            <SelectTrigger id="currencyCode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code}{c.name ? ` — ${c.name}` : ""}
                </SelectItem>
              ))}
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
          <Select value={irpfRate} onValueChange={setIrpfRate}>
            <SelectTrigger id="irpfRate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t("irpfNone")}</SelectItem>
              <SelectItem value="7">7%</SelectItem>
              <SelectItem value="15">15%</SelectItem>
              <SelectItem value="19">19%</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("irpfHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("attach.pdfSection")}</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFileUpload(f)
            e.target.value = ""
          }}
        />
        {pdfFileId && pdfFilename ? (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{pdfFilename}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setPdfFileId(null)
                setPdfFilename(null)
              }}
              aria-label={t("attach.removePdf")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("attach.uploading")}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {t("attach.upload")}
              </>
            )}
          </Button>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => (onCancel ? onCancel() : router.back())}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={createPurchase.isPending}>
          {createPurchase.isPending ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  )
}
