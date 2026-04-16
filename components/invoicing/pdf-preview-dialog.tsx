import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileId: string | null
  title?: string | undefined
}

/**
 * Minimal dialog that embeds the browser's native PDF renderer via iframe.
 * The file-download route already serves the bytes with the right mime type,
 * so no pdf.js dependency is needed.
 */
export function PdfPreviewDialog({ open, onOpenChange, fileId, title }: Props) {
  const { t } = useTranslation("invoices")
  if (!fileId) return null

  const viewSrc = `/files/view/${fileId}`
  const downloadSrc = `/files/download/${fileId}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-3">
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <DialogTitle className="truncate">{title ?? t("preview.title")}</DialogTitle>
          <Button asChild variant="outline" size="sm">
            <a href={downloadSrc} download>
              <Download className="mr-1.5 h-4 w-4" />
              {t("preview.download")}
            </a>
          </Button>
        </DialogHeader>
        <iframe
          src={viewSrc}
          className="w-full flex-1 rounded-md border"
          title={title ?? t("preview.title")}
        />
      </DialogContent>
    </Dialog>
  )
}
