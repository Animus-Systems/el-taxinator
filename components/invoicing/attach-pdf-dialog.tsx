import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatBytes } from "@/lib/utils"
import { FileText, Loader2, Upload } from "lucide-react"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  onUploadNew: () => void
  onAttached: () => void
}

function readSize(metadata: unknown): number {
  if (metadata && typeof metadata === "object" && "size" in metadata) {
    const size = (metadata as Record<string, unknown>)["size"]
    if (typeof size === "number") return size
  }
  return 0
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ""
  const dt = typeof d === "string" ? new Date(d) : d
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

export function AttachPdfDialog({ open, onOpenChange, invoiceId, onUploadNew, onAttached }: Props) {
  const { t } = useTranslation("invoices")
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.files.list.useQuery(
    { status: "orphan", search: "", page: 1, pageSize: 100 },
    { enabled: open },
  )

  const attach = trpc.invoices.attachExistingFile.useMutation({
    onSuccess: () => {
      utils.invoices.getById.invalidate({ id: invoiceId })
      utils.invoices.list.invalidate()
      utils.files.list.invalidate()
      onAttached()
      onOpenChange(false)
    },
  })

  const orphans = data?.files ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("attachPdf.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("attachPdf.dialogSubtitle")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : orphans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("attachPdf.noOrphans")}
          </p>
        ) : (
          <div className="flex max-h-[50vh] flex-col overflow-y-auto rounded-md border">
            {orphans.map((file) => {
              const size = readSize(file.metadata)
              const isAttaching =
                attach.isPending && attach.variables?.fileId === file.id
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() =>
                    attach.mutate({ invoiceId, fileId: file.id })
                  }
                  disabled={attach.isPending}
                  className="flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-50"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium" title={file.filename}>
                      {file.filename}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {file.mimetype}
                      {size > 0 ? ` · ${formatBytes(size)}` : ""}
                      {` · ${formatDate(file.createdAt)}`}
                    </span>
                  </div>
                  {isAttaching && <Loader2 className="h-4 w-4 animate-spin" />}
                </button>
              )
            })}
          </div>
        )}

        {attach.error && (
          <p className="text-sm text-destructive">{attach.error.message}</p>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onUploadNew()
            }}
            disabled={attach.isPending}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {t("attachPdf.uploadNewInstead")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={attach.isPending}
          >
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
