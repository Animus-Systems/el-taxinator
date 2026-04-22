import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Object URL of the generated PDF blob, or null while the request is in flight. */
  blobUrl: string | null
  loading?: boolean
  title?: string
}

/**
 * Shows an in-memory PDF blob in an iframe. Unlike PdfPreviewDialog which
 * loads an already-persisted file, this one is used for draft previews where
 * nothing has been saved to disk yet.
 */
export function InvoicePreviewDialog({ open, onOpenChange, blobUrl, loading, title }: Props) {
  const { t } = useTranslation("invoices")

  useEffect(() => {
    if (!open && blobUrl) {
      URL.revokeObjectURL(blobUrl)
    }
  }, [open, blobUrl])

  const resolvedTitle = title ?? t("preview.title", { defaultValue: "Invoice preview" })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate">{resolvedTitle}</DialogTitle>
        </DialogHeader>
        {loading || !blobUrl ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {t("preview.loading", { defaultValue: "Rendering preview…" })}
          </div>
        ) : (
          <iframe
            src={blobUrl}
            className="w-full flex-1 rounded-md border"
            title={resolvedTitle}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
