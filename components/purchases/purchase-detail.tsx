import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { format } from "date-fns"
import { trpc } from "~/trpc"
import { useRouter, Link } from "@/lib/navigation"
import { Badge, type BadgeProps } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { calcInvoiceTotals } from "@/lib/invoice-calculations"
import { formatCurrency } from "@/lib/utils"
import {
  ArrowLeft,
  Download,
  Eye,
  Link2,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { LinkPurchaseToTransactionDialog } from "./link-purchase-to-transaction-dialog"
import { PdfPreviewDialog } from "@/components/invoicing/pdf-preview-dialog"
import type { PurchaseWithRelations } from "@/models/purchases"

const STATUS_COLORS: Record<string, NonNullable<BadgeProps["variant"]>> = {
  draft: "secondary",
  received: "default",
  paid: "outline",
  overdue: "destructive",
  cancelled: "secondary",
  refunded: "default",
}

export function PurchaseDetail({ purchase }: { purchase: PurchaseWithRelations }) {
  const { t } = useTranslation("purchases")
  const router = useRouter()
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [linkOpen, setLinkOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const { data: payments = [] } = trpc.purchasePayments.listForPurchase.useQuery({
    purchaseId: purchase.id,
  })

  const updateStatus = trpc.purchases.updateStatus.useMutation({
    onSuccess: () => {
      utils.purchases.getById.invalidate({ id: purchase.id })
      utils.purchases.list.invalidate()
      toast.success(t("statusUpdated"))
    },
    onError: (err) => toast.error(err.message),
  })

  const deletePurchase = trpc.purchases.delete.useMutation({
    onSuccess: () => {
      utils.purchases.list.invalidate()
      toast.success(t("deleted"))
      router.push("/purchases")
    },
    onError: (err) => toast.error(err.message),
  })

  const deletePayment = trpc.purchasePayments.delete.useMutation({
    onSuccess: () => {
      utils.purchasePayments.listForPurchase.invalidate({ purchaseId: purchase.id })
      utils.purchases.getById.invalidate({ id: purchase.id })
      toast.success(t("paymentUnlinked"))
    },
    onError: (err) => toast.error(err.message),
  })

  const attachFile = trpc.purchases.attachExistingFile.useMutation({
    onSuccess: () => {
      utils.purchases.getById.invalidate({ id: purchase.id })
      utils.purchases.list.invalidate()
      toast.success(t("attach.uploadSuccess"))
    },
    onError: (err) => toast.error(err.message || t("attach.uploadFailed")),
  })

  const detachPdf = trpc.purchases.detachPdf.useMutation({
    onSuccess: () => {
      utils.purchases.getById.invalidate({ id: purchase.id })
      utils.purchases.list.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

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
      attachFile.mutate({ purchaseId: purchase.id, fileId: json.files[0].id })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("attach.uploadFailed"))
    } finally {
      setUploading(false)
    }
  }

  const [paidAtDraft, setPaidAtDraft] = useState<string>(
    purchase.paidAt ? format(purchase.paidAt, "yyyy-MM-dd") : "",
  )

  const { subtotal, vatTotal, total } = calcInvoiceTotals(purchase.items)
  const irpfAmount = subtotal * (purchase.irpfRate / 100)
  const grandTotal = total - irpfAmount
  const allocated = payments.reduce((sum, p) => sum + p.amountCents, 0)
  const outstanding = Math.max(0, Math.round(grandTotal) - allocated)

  async function onDelete(): Promise<void> {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    deletePurchase.mutate({ id: purchase.id })
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {purchase.supplierInvoiceNumber}
          </h1>
          <p className="text-muted-foreground">
            {purchase.contact ? (
              <Link
                href={`/contacts`}
                className="hover:underline"
              >
                {purchase.contact.name}
              </Link>
            ) : (
              t("noSupplier")
            )}
            {" · "}
            {format(purchase.issueDate, "yyyy-MM-dd")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={purchase.status}
            onValueChange={(status) => {
              const paidAt =
                status === "paid" && paidAtDraft ? new Date(paidAtDraft) : null
              updateStatus.mutate({
                id: purchase.id,
                status: status as "draft" | "received" | "overdue" | "paid" | "cancelled" | "refunded",
                paidAt,
              })
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <SelectTrigger className="w-[140px]">
                  <SelectValue>
                    <Badge variant={STATUS_COLORS[purchase.status] ?? "secondary"}>
                      {t(`statuses.${purchase.status}`, { defaultValue: purchase.status })}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t(`statusHelp.${purchase.status}`, { defaultValue: purchase.status })}
              </TooltipContent>
            </Tooltip>
            <SelectContent>
              {(["draft", "received", "overdue", "paid", "cancelled", "refunded"] as const).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    <div className="flex flex-col">
                      <span>{t(`statuses.${s}`)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {t(`statusHelp.${s}`)}
                      </span>
                    </div>
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {purchase.status === "paid" && (
        <section className="mb-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="paidAt">{t("paidAt")}</Label>
            <Input
              id="paidAt"
              type="date"
              value={paidAtDraft}
              onChange={(e) => setPaidAtDraft(e.target.value)}
              className="w-[180px]"
            />
            <p className="text-xs text-muted-foreground">{t("paidAtHint")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              updateStatus.mutate({
                id: purchase.id,
                status: "paid",
                paidAt: paidAtDraft ? new Date(paidAtDraft) : null,
              })
            }
            disabled={updateStatus.isPending}
          >
            {t("statusUpdated", { defaultValue: "Save" })}
          </Button>
        </section>
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{t("attach.pdfSection")}</h2>
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachFile.isPending}
            >
              {uploading || attachFile.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("attach.uploading")}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {purchase.pdfFileId ? t("attach.replace") : t("attach.upload")}
                </>
              )}
            </Button>
            {purchase.pdfFileId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => detachPdf.mutate({ purchaseId: purchase.id })}
                disabled={detachPdf.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {t("attach.removePdf")}
              </Button>
            )}
          </div>
        </div>
        {purchase.pdfFileId ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {t("attach.fileAttached")}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-4 w-4" />
              {t("attach.viewPdf")}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/files/download/${purchase.pdfFileId}`} download>
                <Download className="h-4 w-4" />
                {t("attach.downloadPdf")}
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("attach.noPdf")}</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">{t("items")}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("description")}</TableHead>
              <TableHead className="text-right">{t("quantity")}</TableHead>
              <TableHead className="text-right">{t("unitPrice")}</TableHead>
              <TableHead className="text-right">{t("vatRate")}</TableHead>
              <TableHead className="text-right">{t("subtotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.items.map((item) => {
              const line = item.quantity * item.unitPrice
              return (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unitPrice, purchase.currencyCode)}
                  </TableCell>
                  <TableCell className="text-right">{item.vatRate}%</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(line, purchase.currencyCode)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-sm space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("subtotal")}</span>
              <span>{formatCurrency(subtotal, purchase.currencyCode)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("vatLabel")}</span>
              <span>{formatCurrency(vatTotal, purchase.currencyCode)}</span>
            </div>
            {purchase.irpfRate > 0 && (
              <div className="flex justify-between text-destructive">
                <span>{t("irpfLabel", { rate: purchase.irpfRate })}</span>
                <span>-{formatCurrency(irpfAmount, purchase.currencyCode)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>{t("total")}</span>
              <span>{formatCurrency(grandTotal, purchase.currencyCode)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{t("paymentsSection")}</h2>
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4" />
            {t("linkTransaction")}
          </Button>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noPayments", { outstanding: formatCurrency(outstanding, purchase.currencyCode) })}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("paymentDate")}</TableHead>
                <TableHead>{t("paymentSource")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{format(p.createdAt, "yyyy-MM-dd")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.source}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(p.amountCents, purchase.currencyCode)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePayment.mutate({ id: p.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {purchase.notes && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">{t("notes")}</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{purchase.notes}</p>
        </section>
      )}

      <LinkPurchaseToTransactionDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        purchaseId={purchase.id}
        outstandingCents={outstanding}
        includeIncome={purchase.status === "refunded"}
      />

      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileId={purchase.pdfFileId}
        title={purchase.supplierInvoiceNumber}
      />
    </TooltipProvider>
  )
}
