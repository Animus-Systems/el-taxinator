import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, X } from "lucide-react"
import type { ExtractedReceipt } from "@/ai/extract-receipt"
import { ReceiptsReview } from "./receipts-review"

type UploadedReceipt = {
  fileId: string
  filename: string
  mimetype: string
  extracted: ExtractedReceipt
}

type State = "idle" | "uploading" | "reviewing" | "complete"

type UploadResponse = {
  success: boolean
  receipts?: UploadedReceipt[]
  error?: string
}

export function ReceiptsUpload({ onComplete }: { onComplete?: () => void }) {
  const t = useTranslations("transactions")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>("idle")
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [uploaded, setUploaded] = useState<UploadedReceipt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [committedCount, setCommittedCount] = useState(0)

  const addFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return
    const allowed: File[] = []
    for (const file of Array.from(list)) {
      const ok =
        file.type === "application/pdf" ||
        file.type.startsWith("image/") ||
        file.name.toLowerCase().endsWith(".pdf")
      if (!ok) continue
      allowed.push(file)
    }
    setStagedFiles((prev) => [...prev, ...allowed])
    setError(null)
  }, [])

  const removeFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleAnalyze = async () => {
    if (stagedFiles.length === 0) return
    setState("uploading")
    setError(null)

    const formData = new FormData()
    for (const file of stagedFiles) {
      formData.append("file", file)
    }

    try {
      const response = await fetch("/api/receipts/upload", {
        method: "POST",
        body: formData,
      })
      const body = (await response.json()) as UploadResponse
      if (!response.ok || !body.success || !body.receipts) {
        throw new Error(body.error ?? "Upload failed")
      }
      setUploaded(body.receipts)
      setStagedFiles([])
      setState("reviewing")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setState("idle")
    }
  }

  const handleComplete = (counts: { attached: number; created: number; orphaned: number }) => {
    setCommittedCount(counts.attached + counts.created)
    setState("complete")
    onComplete?.()
  }

  const handleReset = () => {
    setState("idle")
    setStagedFiles([])
    setUploaded([])
    setError(null)
    setCommittedCount(0)
  }

  if (state === "reviewing") {
    return (
      <ReceiptsReview
        receipts={uploaded}
        onComplete={handleComplete}
        onCancel={handleReset}
      />
    )
  }

  if (state === "complete") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-lg font-medium">{t("receipts.commitSuccess")}</p>
          {committedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("receipts.commitSuccessDetail", { count: committedCount })}
            </p>
          )}
          <Button variant="outline" onClick={handleReset}>
            {t("receipts.uploadMore")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              addFiles(event.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">{t("receipts.dropHere")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("receipts.dropHint")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {stagedFiles.length > 0 && (
        <ul className="divide-y rounded-md border">
          {stagedFiles.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => removeFile(index)}
                disabled={state === "uploading"}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={handleAnalyze}
          disabled={stagedFiles.length === 0 || state === "uploading"}
        >
          {state === "uploading" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {state === "uploading" ? t("receipts.analyzing") : t("receipts.analyze")}
        </Button>
      </div>
    </div>
  )
}
