import { useState } from "react"
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
import { Loader2, Upload } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type UploadResponse = {
  success: boolean
  error?: string
  needsReview?: boolean
  incomeSourceId?: string
  transactionId?: string
  extracted?: {
    employerName: string | null
    gross: number | null
    net: number | null
    irpfWithheld: number | null
    periodStart: string | null
    periodEnd: string | null
  }
}

export function PayslipUploadDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("tax")
  const utils = trpc.useUtils()
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [result, setResult] = useState<UploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClose = (nextOpen: boolean) => {
    if (isUploading) return
    if (!nextOpen) {
      setFile(null)
      setResult(null)
      setError(null)
      if (result?.success && !result.needsReview) {
        utils.incomeSources.list.invalidate()
        utils.incomeSources.totals.invalidate()
        utils.transactions.list.invalidate()
      }
    }
    onOpenChange(nextOpen)
  }

  const handleUpload = async () => {
    if (!file) return
    setError(null)
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/personal/payslip/upload", {
        method: "POST",
        body: formData,
      })
      const body = (await response.json()) as UploadResponse
      if (!response.ok || !body.success) {
        setError(body.error ?? "Upload failed")
        return
      }
      setResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("personal.employment.uploadDialogTitle")}</DialogTitle>
          <DialogDescription>{t("personal.employment.uploadDialogSubtitle")}</DialogDescription>
        </DialogHeader>

        {!result ? (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 py-10 hover:border-muted-foreground/60">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {file ? file.name : t("personal.employment.dropPayslipHere")}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(event) => {
                  const next = event.target.files?.[0]
                  if (next) setFile(next)
                }}
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        ) : result.needsReview ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">{t("personal.employment.reviewNeeded")}</p>
            <p className="text-muted-foreground">{t("personal.employment.reviewNeededHint")}</p>
          </div>
        ) : (
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{t("personal.employment.extracted")}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{t("personal.employment.employer")}</dt>
              <dd>{result.extracted?.employerName ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("personal.employment.period")}</dt>
              <dd>
                {result.extracted?.periodStart ?? "—"} → {result.extracted?.periodEnd ?? "—"}
              </dd>
              <dt className="text-muted-foreground">{t("personal.employment.gross")}</dt>
              <dd>
                {result.extracted?.gross != null
                  ? formatCurrency(Math.round(result.extracted.gross * 100), "EUR")
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">{t("personal.employment.net")}</dt>
              <dd>
                {result.extracted?.net != null
                  ? formatCurrency(Math.round(result.extracted.net * 100), "EUR")
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">{t("personal.employment.irpfWithheld")}</dt>
              <dd>
                {result.extracted?.irpfWithheld != null
                  ? formatCurrency(Math.round(result.extracted.irpfWithheld * 100), "EUR")
                  : "—"}
              </dd>
            </dl>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={isUploading}
          >
            {result ? t("personal.done") : t("personal.cancel")}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!file || isUploading}
            >
              {isUploading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isUploading ? t("personal.employment.analyzing") : t("personal.employment.analyze")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
