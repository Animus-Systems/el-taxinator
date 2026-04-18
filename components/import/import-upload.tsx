
import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import type { BankAccount } from "@/lib/db-types"
import type { TransactionCandidate } from "@/ai/import-csv"
import {
  startCSVImportAction,
  categorizeSessionAction,
  detectPDFTypeAction,
  extractPDFImportAction,
  getImportSessionAction,
  recategorizeWithFeedbackAction,
} from "@/actions/ai-import"
import type { SuggestedCategory } from "@/ai/import-csv"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ReviewTable } from "@/components/import/review-table"
import { Loader2, Upload, CheckCircle, Paperclip, X } from "lucide-react"
import { trpc } from "~/trpc"

type State = "idle" | "parsing" | "categorizing" | "detecting" | "extracting" | "attaching" | "reviewing" | "complete"

type SessionData = {
  sessionId: string
  candidates: TransactionCandidate[]
  bank: string
  fileName: string
  categories: Array<{ code: string; name: string }>
  projects: Array<{ code: string; name: string }>
  suggestedCategories: SuggestedCategory[]
}

type Props = {
  accounts: BankAccount[]
  onComplete?: () => void
}

const PRIMARY_EXTENSIONS = [".csv", ".xlsx", ".xls", ".pdf"] as const

function hasSupportedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return PRIMARY_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function pickPrimaryIndex(files: File[]): number {
  if (files.length === 0) return -1
  // Spreadsheets come first (CSV is most natural, then XLSX/XLS — all three
  // flow through the CSV pipeline server-side), then PDF as a fallback.
  const csvIndex = files.findIndex((f) => f.name.toLowerCase().endsWith(".csv"))
  if (csvIndex >= 0) return csvIndex
  const xlsxIndex = files.findIndex((f) => {
    const lower = f.name.toLowerCase()
    return lower.endsWith(".xlsx") || lower.endsWith(".xls")
  })
  if (xlsxIndex >= 0) return xlsxIndex
  const pdfIndex = files.findIndex((f) => f.name.toLowerCase().endsWith(".pdf"))
  if (pdfIndex >= 0) return pdfIndex
  return 0
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

function findSharedBaseNameHint(files: File[], primaryIndex: number): string | null {
  if (files.length < 2 || primaryIndex < 0) return null
  const primary = files[primaryIndex]
  if (!primary) return null
  const primaryBase = baseName(primary.name).toLowerCase()
  const sibling = files.find(
    (f, idx) => idx !== primaryIndex && baseName(f.name).toLowerCase() === primaryBase,
  )
  if (!sibling) return null
  return `${primary.name} · ${sibling.name}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type UploadResponse = {
  success: boolean
  error?: string
  files?: Array<{ id: string; filename: string }>
}

async function uploadContextFile(file: File): Promise<string> {
  const form = new FormData()
  form.append("files", file)
  const resp = await fetch("/api/files/upload", {
    method: "POST",
    body: form,
    credentials: "include",
  })
  if (!resp.ok) {
    throw new Error(`upload failed (${resp.status})`)
  }
  const json = (await resp.json()) as UploadResponse
  const created = json.files?.[0]
  if (!json.success || !created) {
    throw new Error(json.error ?? "upload failed")
  }
  return created.id
}

export function ImportUpload({ accounts, onComplete }: Props) {
  const t = useTranslations("settings")
  const { data: categories = [] } = trpc.categories.list.useQuery({})
  const { data: projects = [] } = trpc.projects.list.useQuery({})
  const addContextFile = trpc.wizard.addContextFile.useMutation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>("idle")
  const [files, setFiles] = useState<File[]>([])
  const [accountId, setAccountId] = useState<string>("__none__")
  const [error, setError] = useState<string | null>(null)
  const [bank, setBank] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [contextProgress, setContextProgress] = useState<{ done: number; total: number } | null>(null)

  const categoryOptions = categories.map((category) => ({
    code: category.code,
    name: typeof category.name === "string" ? category.name : category.name["en"] || Object.values(category.name)[0] || category.code,
  }))
  const projectOptions = projects.map((project) => ({
    code: project.code,
    name: typeof project.name === "string" ? project.name : project.name["en"] || Object.values(project.name)[0] || project.code,
  }))

  useEffect(() => {
    setSessionData((prev) => {
      if (!prev) return prev

      const categoriesUnchanged =
        prev.categories.length === categoryOptions.length &&
        prev.categories.every((category, index) => category.code === categoryOptions[index]?.code)
      const projectsUnchanged =
        prev.projects.length === projectOptions.length &&
        prev.projects.every((project, index) => project.code === projectOptions[index]?.code)

      if (categoriesUnchanged && projectsUnchanged) {
        return prev
      }

      return {
        ...prev,
        categories: categoryOptions,
        projects: projectOptions,
      }
    })
  }, [categories, projects])

  const primaryIndex = useMemo(() => pickPrimaryIndex(files), [files])
  const primaryFile = primaryIndex >= 0 ? files[primaryIndex] : null
  const contextFiles = files.filter((_, i) => i !== primaryIndex)
  const sharedBaseHint = useMemo(
    () => findSharedBaseNameHint(files, primaryIndex),
    [files, primaryIndex],
  )

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return
    const rejected: string[] = []
    const accepted: File[] = []
    for (const f of incoming) {
      if (hasSupportedExtension(f.name)) {
        accepted.push(f)
      } else {
        rejected.push(f.name)
      }
    }
    if (accepted.length > 0) {
      setFiles((prev) => {
        const existing = new Set(prev.map((p) => `${p.name}:${p.size}`))
        const deduped = accepted.filter((f) => !existing.has(`${f.name}:${f.size}`))
        return [...prev, ...deduped]
      })
    }
    setError(
      rejected.length > 0
        ? `Unsupported file type: ${rejected.join(", ")}. Only CSV, XLSX/XLS, and PDF are supported.`
        : null,
    )
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const dropped = Array.from(e.dataTransfer.files)
      if (dropped.length > 0) addFiles(dropped)
    },
    [addFiles],
  )

  const handleRemoveFile = useCallback((file: File) => {
    setFiles((prev) => prev.filter((f) => !(f.name === file.name && f.size === file.size)))
  }, [])

  const handleAnalyze = async () => {
    if (!primaryFile) return
    setError(null)

    const formData = new FormData()
    formData.append("file", primaryFile)
    if (accountId !== "__none__") {
      formData.append("accountId", accountId)
    }

    // Route by extension: PDFs go through the detect/extract pipeline; CSV
    // and XLSX/XLS both flow through the CSV route (the server transparently
    // converts xlsx → csv before mapping).
    const lowerName = primaryFile.name.toLowerCase()
    const isPdf = lowerName.endsWith(".pdf")

    let resolvedSessionId: string | null = null
    let resolvedBank: string | null = null
    let resolvedCandidates: TransactionCandidate[] = []
    let resolvedSuggested: SuggestedCategory[] = []

    if (isPdf) {
      // PDF flow: detect type → extract transactions
      setState("detecting")
      const detectResult = await detectPDFTypeAction(formData)
      if (!detectResult.success) {
        setState("idle")
        setError(detectResult.error ?? "Failed to detect PDF type")
        return
      }

      setState("extracting")
      const result = await extractPDFImportAction(formData)
      if (!result.success) {
        setState("idle")
        setError(result.error ?? "Failed to extract PDF transactions")
        return
      }

      resolvedBank = result.bank ?? null
      const sessionId = result.sessionId ?? ""
      const sessionResult = await getImportSessionAction(sessionId)
      if (!sessionResult.success || !sessionResult.session) {
        setState("idle")
        setError(sessionResult.error ?? "Failed to load session")
        return
      }
      resolvedSessionId = sessionId
      resolvedCandidates = sessionResult.session.data
      resolvedSuggested = sessionResult.session.suggestedCategories || []
    } else {
      // CSV flow: parse & map → categorize
      setState("parsing")
      const result = await startCSVImportAction(formData)
      if (!result.success) {
        setState("idle")
        setError(result.error ?? "Failed to start CSV import")
        return
      }

      resolvedBank = result.bank ?? null

      setState("categorizing")
      const sessionId = result.sessionId ?? ""
      await categorizeSessionAction(sessionId)

      const sessionResult = await getImportSessionAction(sessionId)
      if (!sessionResult.success || !sessionResult.session) {
        setState("idle")
        setError(sessionResult.error ?? "Failed to load session")
        return
      }
      resolvedSessionId = sessionId
      resolvedCandidates = sessionResult.session.data
      resolvedSuggested = sessionResult.session.suggestedCategories || []
    }

    if (!resolvedSessionId) {
      setState("idle")
      setError("Session was not created")
      return
    }

    setBank(resolvedBank)

    // Attach context files (best-effort, don't block)
    if (contextFiles.length > 0) {
      setState("attaching")
      setContextProgress({ done: 0, total: contextFiles.length })
      for (let i = 0; i < contextFiles.length; i++) {
        const cf = contextFiles[i]
        if (!cf) continue
        try {
          const fileId = await uploadContextFile(cf)
          await addContextFile.mutateAsync({ sessionId: resolvedSessionId, fileId })
        } catch (err) {
          console.warn("Failed to attach context file:", cf.name, err)
        }
        setContextProgress({ done: i + 1, total: contextFiles.length })
      }
      setContextProgress(null)
    }

    setSessionData({
      sessionId: resolvedSessionId,
      candidates: resolvedCandidates,
      bank: resolvedBank ?? "",
      fileName: primaryFile.name,
      categories: categoryOptions,
      projects: projectOptions,
      suggestedCategories: resolvedSuggested,
    })
    setState("reviewing")
  }

  const handleComplete = () => {
    const count = sessionData
      ? sessionData.candidates.filter((c) => c.selected).length
      : 0
    setImportedCount(count)
    setState("complete")
    if (onComplete) onComplete()
  }

  const handleCancel = () => {
    setState("idle")
    setFiles([])
    setBank(null)
    setSessionData(null)
    setError(null)
  }

  const handleReset = () => {
    setState("idle")
    setFiles([])
    setBank(null)
    setSessionData(null)
    setError(null)
    setImportedCount(0)
  }

  if (state === "reviewing" && sessionData) {
    return (
      <ReviewTable
        sessionId={sessionData.sessionId}
        candidates={sessionData.candidates}
        bank={sessionData.bank}
        fileName={sessionData.fileName}
        categories={sessionData.categories}
        projects={sessionData.projects}
        suggestedCategories={sessionData.suggestedCategories}
        onRecategorize={async (feedback, reviewedCandidates) => {
          await recategorizeWithFeedbackAction(sessionData.sessionId, feedback, reviewedCandidates)
          const updated = await getImportSessionAction(sessionData.sessionId)
          if (updated.success && updated.session) {
            setSessionData({
              ...sessionData,
              candidates: updated.session.data,
              suggestedCategories: updated.session.suggestedCategories || [],
            })
          }
        }}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    )
  }

  if (state === "complete") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-lg font-medium">{t("importComplete")}</p>
          {importedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {importedCount} {t("transactionsImported")}
            </p>
          )}
          <Button variant="outline" onClick={handleReset}>
            Import another file
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("selectAccount")}</label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder={t("selectAccount")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-</SelectItem>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                {acc.name}
                {acc.bankName ? ` (${acc.bankName})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent className="p-0">
          <div
            className={`flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">{t("dropFileHere")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("orClickToUpload")}
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-md text-center px-4">
              {t("multiFileHint")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                e.target.value = ""
                if (picked.length > 0) addFiles(picked)
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* File chips */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {files.map((f) => {
              const isPrimary = f === primaryFile
              return (
                <div
                  key={`${f.name}:${f.size}`}
                  className={[
                    "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                    isPrimary
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : "border-border bg-muted text-muted-foreground",
                  ].join(" ")}
                  title={isPrimary ? t("primaryChipHint") : t("contextChipHint")}
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[180px]">{f.name}</span>
                  <span className="text-[10px] opacity-70">{formatSize(f.size)}</span>
                  <Badge
                    variant={isPrimary ? "default" : "outline"}
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    {isPrimary ? t("primaryChip") : t("contextChip")}
                  </Badge>
                  {state === "idle" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFile(f)
                      }}
                      className="rounded-sm p-0.5 hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
          {sharedBaseHint ? (
            <p className="text-xs text-muted-foreground">
              {t("sharedBaseHint", { pair: sharedBaseHint })}
            </p>
          ) : null}
          {bank ? (
            <p className="text-xs text-muted-foreground">
              {t("bankDetected")}: {bank}
            </p>
          ) : null}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Analyze button */}
      {primaryFile && state === "idle" && (
        <Button onClick={handleAnalyze}>
          {t("analyze")}
        </Button>
      )}

      {/* Step-based progress */}
      {state === "parsing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("analyzingCSV")}
        </div>
      )}
      {state === "categorizing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("categorizingTransactions")}
        </div>
      )}
      {state === "detecting" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("detectingDocType")}
        </div>
      )}
      {state === "extracting" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("extractingTransactions")}
        </div>
      )}
      {state === "attaching" && contextProgress && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("attachingContextFiles", {
            done: contextProgress.done,
            total: contextProgress.total,
          })}
        </div>
      )}
    </div>
  )
}
