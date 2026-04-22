
import { deleteInvoiceAction, updateInvoiceStatusAction } from "@/actions/invoices"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceWithRelations } from "@/models/invoices"
import { format } from "date-fns"
import { ArrowLeft, Check, Download, Eye, Link2, Paperclip, Pencil, RefreshCw, Trash2, X } from "lucide-react"
import { Link, useRouter } from "@/lib/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { LinkInvoiceToTransactionDialog } from "./link-invoice-to-transaction-dialog"
import { PdfPreviewDialog } from "./pdf-preview-dialog"
import { AttachPdfDialog } from "./attach-pdf-dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { ContactPicker } from "@/components/contacts/contact-picker"

const STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const

export function InvoiceDetail({
  invoice,
}: {
  invoice: InvoiceWithRelations
}) {
  const router = useRouter()
  const t = useTranslations("invoices")
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()
  const { subtotal, vatTotal, total } = calcInvoiceTotals(invoice.items, invoice.totalCents)

  const utils = trpc.useUtils()
  const invoiceCurrency = (invoice.currencyCode || "EUR").toUpperCase()
  const { data: contacts = [] } = trpc.contacts.list.useQuery({})
  const updateContact = trpc.invoices.updateContact.useMutation({
    onSuccess: () => {
      utils.invoices.getById.invalidate({ id: invoice.id })
      utils.invoices.list.invalidate()
      toast.success(t("contactUpdated", { defaultValue: "Contact updated" }))
    },
    onError: (err) => {
      toast.error(err.message || t("failedToUpdate"))
    },
  })
  const updateCurrency = trpc.invoices.updateCurrency.useMutation({
    onSuccess: () => {
      utils.invoices.getById.invalidate({ id: invoice.id })
      utils.invoices.list.invalidate()
      toast.success(t("currencyUpdated", { defaultValue: "Currency updated" }))
    },
    onError: (err) => {
      toast.error(err.message || t("failedToUpdate"))
    },
  })
  const setTotal = trpc.invoices.setTotal.useMutation({
    onSuccess: () => {
      utils.invoices.getById.invalidate({ id: invoice.id })
      utils.invoices.list.invalidate()
      utils.reconcile.data.invalidate()
      utils.reconcile.links.invalidate()
      toast.success(t("totalUpdated", { defaultValue: "Printed total updated." }))
    },
    onError: (err) => toast.error(err.message || t("failedToUpdate")),
  })
  const [editingTotal, setEditingTotal] = useState(false)
  const [printedTotalDraft, setPrintedTotalDraft] = useState<string>(
    invoice.totalCents !== null && invoice.totalCents !== undefined
      ? (invoice.totalCents / 100).toFixed(2)
      : "",
  )
  useEffect(() => {
    setPrintedTotalDraft(
      invoice.totalCents !== null && invoice.totalCents !== undefined
        ? (invoice.totalCents / 100).toFixed(2)
        : "",
    )
  }, [invoice.totalCents])
  function commitTotal(): void {
    const raw = printedTotalDraft.trim()
    if (raw === "") {
      setTotal.mutate({ id: invoice.id, totalCents: null })
      setEditingTotal(false)
      return
    }
    const euros = Number.parseFloat(raw)
    if (!Number.isFinite(euros) || euros <= 0) return
    setTotal.mutate({ id: invoice.id, totalCents: Math.round(euros * 100) })
    setEditingTotal(false)
  }
  const [currencyDraft, setCurrencyDraft] = useState(invoiceCurrency)
  useEffect(() => {
    setCurrencyDraft(invoiceCurrency)
  }, [invoiceCurrency])

  function commitCurrency(): void {
    const next = currencyDraft.trim().toUpperCase()
    if (next.length !== 3 || next === invoiceCurrency) {
      setCurrencyDraft(invoiceCurrency)
      return
    }
    updateCurrency.mutate({ id: invoice.id, currencyCode: next })
  }
  const { data: payments = [] } = trpc.invoicePayments.listForInvoice.useQuery({
    invoiceId: invoice.id,
  })
  const deletePayment = trpc.invoicePayments.delete.useMutation({
    onSuccess: () => {
      utils.invoicePayments.listForInvoice.invalidate({ invoiceId: invoice.id })
      utils.invoices.getById.invalidate({ id: invoice.id })
      utils.invoices.list.invalidate()
      router.refresh()
    },
  })
  const allocated = payments.reduce((sum, p) => sum + p.amountCents, 0)
  const invoiceTotalCents = Math.round(total)
  const outstanding = Math.max(invoiceTotalCents - allocated, 0)
  const [linkOpen, setLinkOpen] = useState(false)
  const attachInputRef = useRef<HTMLInputElement | null>(null)
  const [isAttaching, setIsAttaching] = useState(false)
  const [attachDialogOpen, setAttachDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewOverrideFileId, setPreviewOverrideFileId] = useState<string | null>(null)
  const [isRegenerating, setIsRegenerating] = useState(false)

  async function onRegenerate() {
    const ok = await confirm({
      title: t("attachPdf.regenerateConfirmTitle"),
      description: t("attachPdf.regenerateConfirm"),
      confirmLabel: t("attachPdf.regenerate"),
    })
    if (!ok) return
    setIsRegenerating(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/regenerate-pdf`, {
        method: "POST",
      })
      const data = (await res.json()) as {
        success: boolean
        fileId?: string
        error?: string
      }
      if (!res.ok || !data.success) {
        toast.error(data.error ?? `Regenerate failed (${res.status})`)
        return
      }
      toast.success(t("attachPdf.regenerateSuccess"))
      utils.invoices.getById.invalidate({ id: invoice.id })
      utils.invoices.list.invalidate()
      router.refresh()
      if (data.fileId) {
        setPreviewOverrideFileId(data.fileId)
        setPreviewOpen(true)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRegenerating(false)
    }
  }

  async function onAttachPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsAttaching(true)
    const body = new FormData()
    body.append("file", file)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/attach-pdf`, {
        method: "POST",
        body,
      })
      const data = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !data.success) {
        toast.error(data.error ?? `Upload failed (${res.status})`)
        return
      }
      toast.success(t("attachPdf.success"))
      utils.invoices.getById.invalidate({ id: invoice.id })
      utils.invoices.list.invalidate()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsAttaching(false)
      if (attachInputRef.current) attachInputRef.current.value = ""
    }
  }

  function handleStatusChange(status: string) {
    const formData = new FormData()
    formData.set("invoiceId", invoice.id)
    formData.set("status", status)
    startTransition(async () => {
      const result = await updateInvoiceStatusAction(null, formData)
      if (result.success) {
        toast.success(t("statusUpdated"))
        router.refresh()
      } else {
        toast.error(result.error || t("failedToUpdate"))
      }
    })
  }

  async function handleDelete() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteInvoiceAction(null, invoice.id)
      if (result.success) {
        toast.success(t("invoiceDeleted"))
        router.push("/invoices")
      } else {
        toast.error(result.error || t("failedToDeleteInvoice"))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-2xl font-bold">{invoice.number}</h2>
          <Badge>{invoice.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">
              {t("currency", { defaultValue: "Currency" })}
            </label>
            <Input
              value={currencyDraft}
              onChange={(e) =>
                setCurrencyDraft(e.target.value.toUpperCase().slice(0, 3))
              }
              onBlur={commitCurrency}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitCurrency()
                }
              }}
              disabled={updateCurrency.isPending}
              maxLength={3}
              className="h-9 w-20 uppercase"
              placeholder="EUR"
              aria-label={t("currency", { defaultValue: "Currency" })}
            />
          </div>
          <Select value={invoice.status} onValueChange={handleStatusChange} disabled={isPending}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 p-6 border rounded-lg">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t("client")}</p>
          <ContactPicker
            contacts={contacts}
            value={invoice.contactId ?? ""}
            onChange={(id) =>
              updateContact.mutate({ id: invoice.id, contactId: id || null })
            }
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
          {invoice.client?.taxId && (
            <p className="text-sm text-muted-foreground">NIF: {invoice.client.taxId}</p>
          )}
          {invoice.client?.address && <p className="text-sm">{invoice.client.address}</p>}
          {invoice.client?.email && <p className="text-sm">{invoice.client.email}</p>}
        </div>
        <div className="space-y-1 text-right">
          <div>
            <p className="text-sm text-muted-foreground">{t("issueDate")}</p>
            <p className="font-medium">{format(invoice.issueDate, "dd/MM/yyyy")}</p>
          </div>
          {invoice.dueDate && (
            <div>
              <p className="text-sm text-muted-foreground">{t("dueDate")}</p>
              <p className="font-medium">{format(invoice.dueDate, "dd/MM/yyyy")}</p>
            </div>
          )}
          {invoice.paidAt && (
            <div>
              <p className="text-sm text-muted-foreground">{t("paid")}</p>
              <p className="font-medium text-green-600">{format(invoice.paidAt, "dd/MM/yyyy")}</p>
            </div>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("description")}</TableHead>
            <TableHead className="text-right">{t("qty")}</TableHead>
            <TableHead className="text-right">{t("unitPrice")}</TableHead>
            <TableHead className="text-right">{t("vatPercent")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.description}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.unitPrice, invoiceCurrency)}</TableCell>
              <TableCell className="text-right">{item.vatRate}%</TableCell>
              <TableCell className="text-right">{formatCurrency(item.quantity * item.unitPrice, invoiceCurrency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>{t("subtotal")}</TableCell>
            <TableCell className="text-right">{formatCurrency(subtotal, invoiceCurrency)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={4}>{t("iva")}</TableCell>
            <TableCell className="text-right">{formatCurrency(vatTotal, invoiceCurrency)}</TableCell>
          </TableRow>
          {invoice.irpfRate > 0 && (
            <TableRow className="text-muted-foreground">
              <TableCell colSpan={4}>{t("irpfRetention", { rate: invoice.irpfRate })}</TableCell>
              <TableCell className="text-right">−{formatCurrency(Math.round(subtotal * invoice.irpfRate / 100), invoiceCurrency)}</TableCell>
            </TableRow>
          )}
          <TableRow className="font-bold">
            <TableCell colSpan={4}>{t("totalToPay")}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(total - (invoice.irpfRate > 0 ? Math.round(subtotal * invoice.irpfRate / 100) : 0), invoiceCurrency)}
            </TableCell>
          </TableRow>
          <TableRow className="text-xs text-muted-foreground">
            <TableCell colSpan={4}>
              {t("printedTotal", { defaultValue: "Printed total (incl. VAT)" })}
            </TableCell>
            <TableCell className="text-right">
              {editingTotal ? (
                <div className="inline-flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={printedTotalDraft}
                    onChange={(e) => setPrintedTotalDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        commitTotal()
                      }
                      if (e.key === "Escape") setEditingTotal(false)
                    }}
                    className="h-8 w-28"
                    placeholder={t("printedTotalPlaceholder", {
                      defaultValue: "Blank = from items",
                    })}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={commitTotal}
                    aria-label={t("save", { defaultValue: "Save" })}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingTotal(false)}
                    aria-label={t("cancel", { defaultValue: "Cancel" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTotal(true)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <span>
                    {invoice.totalCents !== null && invoice.totalCents !== undefined
                      ? formatCurrency(invoice.totalCents, invoiceCurrency)
                      : t("printedTotalUnset", {
                          defaultValue: "— (computed from items)",
                        })}
                  </span>
                  <Pencil className="h-3 w-3 opacity-60" aria-hidden />
                </button>
              )}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {invoice.notes && (
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">{t("notes")}</p>
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      <div className="space-y-2 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("payments.heading")}</p>
            <p className="text-xs text-muted-foreground">
              {t("payments.outstanding", {
                allocated: formatCurrency(allocated, invoiceCurrency),
                total: formatCurrency(invoiceTotalCents, invoiceCurrency),
                outstanding: formatCurrency(outstanding, invoiceCurrency),
              })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinkOpen(true)}
            disabled={outstanding <= 0}
          >
            <Link2 className="mr-1.5 h-4 w-4" />
            {t("payments.linkButton")}
          </Button>
        </div>
        {payments.length > 0 && (
          <ul className="divide-y rounded-md border">
            {payments.map((p) => {
              const tx = p.transaction
              const txLabel =
                tx?.name || tx?.merchant || t("payments.transactionLink")
              return (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={`/transactions/${p.transactionId}`}
                    className="truncate text-primary underline-offset-2 hover:underline"
                  >
                    {txLabel}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {tx?.issuedAt
                      ? format(tx.issuedAt, "yyyy-MM-dd")
                      : format(p.createdAt, "yyyy-MM-dd HH:mm")}
                    {p.source === "ai" ? ` · ${t("payments.sourceAi")}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatCurrency(p.amountCents, invoiceCurrency)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePayment.mutate({ id: p.id })}
                    disabled={deletePayment.isPending}
                    aria-label={t("payments.unlink")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </div>

      <LinkInvoiceToTransactionDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        invoiceId={invoice.id}
        invoiceTotalCents={invoiceTotalCents}
        invoiceAllocatedCents={allocated}
        invoiceCurrency={invoiceCurrency}
        onLinked={() => {
          utils.invoicePayments.listForInvoice.invalidate({ invoiceId: invoice.id })
          utils.invoices.getById.invalidate({ id: invoice.id })
          utils.invoices.list.invalidate()
          router.refresh()
        }}
      />

      <input
        ref={attachInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={onAttachPdf}
      />

      {invoice.pdfFileId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("preview.attachedPdf")}</p>
            <p className="text-xs text-muted-foreground">{t("attachPdf.rowHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="mr-1.5 h-4 w-4" />
              {t("attachPdf.preview")}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/files/download/${invoice.pdfFileId}`} download>
                <Download className="mr-1.5 h-4 w-4" />
                {t("preview.download")}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttachDialogOpen(true)}
              disabled={isAttaching}
            >
              <Paperclip className="mr-1.5 h-4 w-4" />
              {isAttaching ? t("attachPdf.uploading") : t("attachPdf.replace")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {isRegenerating ? t("attachPdf.regenerating") : t("attachPdf.regenerate")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <div>
            <p className="text-sm font-medium">{t("attachPdf.noneHeading")}</p>
            <p className="text-xs text-muted-foreground">{t("attachPdf.noneHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttachDialogOpen(true)}
              disabled={isAttaching}
            >
              <Paperclip className="mr-1.5 h-4 w-4" />
              {isAttaching ? t("attachPdf.uploading") : t("attachPdf.attach")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {isRegenerating ? t("attachPdf.regenerating") : t("attachPdf.regenerate")}
            </Button>
          </div>
        </div>
      )}

      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={(next) => {
          setPreviewOpen(next)
          if (!next) setPreviewOverrideFileId(null)
        }}
        fileId={previewOverrideFileId ?? invoice.pdfFileId}
        title={invoice.number}
      />

      <AttachPdfDialog
        open={attachDialogOpen}
        onOpenChange={setAttachDialogOpen}
        invoiceId={invoice.id}
        onUploadNew={() => attachInputRef.current?.click()}
        onAttached={() => {
          toast.success(t("attachPdf.success"))
          router.refresh()
        }}
      />

      {invoice.quote && (
        <div className="text-sm text-muted-foreground">
          {t("convertedFromQuote")}{" "}
          <Link href={`/quotes/${invoice.quote.id}`} className="underline">
            {invoice.quote.number}
          </Link>
        </div>
      )}
    </div>
  )
}
