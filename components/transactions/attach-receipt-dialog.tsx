import { useState } from "react"
import { useTranslations } from "next-intl"
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
  transactionId: string
  onAttached?: () => void
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

export function AttachReceiptDialog({
  open,
  onOpenChange,
  transactionId,
  onAttached,
}: Props) {
  const t = useTranslations("transactions")
  const utils = trpc.useUtils()
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = trpc.files.list.useQuery(
    { status: "orphan", search: "", page: 1, pageSize: 100 },
    { enabled: open },
  )

  const attach = trpc.transactions.attachFile.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate()
      utils.transactions.getById.invalidate({ id: transactionId })
      utils.files.list.invalidate()
      onAttached?.()
      onOpenChange(false)
    },
    onError: (err) => setError(err.message),
  })

  const upload = async (file: File) => {
    setError(null)
    const formData = new FormData()
    formData.append("file", file)
    const response = await fetch("/api/receipts/upload", {
      method: "POST",
      body: formData,
    })
    const body = (await response.json()) as {
      success: boolean
      receipts?: { fileId: string }[]
      error?: string
    }
    if (!response.ok || !body.success || !body.receipts || body.receipts.length === 0) {
      setError(body.error ?? "Upload failed")
      return
    }
    const fileId = body.receipts[0]!.fileId
    attach.mutate({ transactionId, fileId })
  }

  const orphans = data?.files ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("receipts.attachDialogTitle")}</DialogTitle>
          <DialogDescription>{t("receipts.attachDialogSubtitle")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : orphans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("receipts.noOrphans")}
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
                  onClick={() => attach.mutate({ transactionId, fileId: file.id })}
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="sm:justify-between">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Upload className="h-4 w-4" />
            {t("receipts.uploadNewInstead")}
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
              }}
              disabled={attach.isPending}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={attach.isPending}
          >
            {t("receipts.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
