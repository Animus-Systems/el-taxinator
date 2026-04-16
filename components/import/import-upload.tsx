
import { useState, useCallback, useRef, useEffect } from "react"
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
import { Loader2, Upload, CheckCircle } from "lucide-react"
import { trpc } from "~/trpc"

type State = "idle" | "parsing" | "categorizing" | "detecting" | "extracting" | "reviewing" | "complete"

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

export function ImportUpload({ accounts, onComplete }: Props) {
  const t = useTranslations("settings")
  const { data: categories = [] } = trpc.categories.list.useQuery({})
  const { data: projects = [] } = trpc.projects.list.useQuery({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState<string>("__none__")
  const [error, setError] = useState<string | null>(null)
  const [bank, setBank] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

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

  const handleFile = useCallback((f: File) => {
    const ext = f.name.toLowerCase()
    if (!ext.endsWith(".csv") && !ext.endsWith(".pdf")) {
      setError("Only CSV and PDF files are supported")
      return
    }
    setFile(f)
    setError(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) handleFile(droppedFile)
    },
    [handleFile]
  )

  const handleAnalyze = async () => {
    if (!file) return
    setError(null)

    const formData = new FormData()
    formData.append("file", file)
    if (accountId !== "__none__") {
      formData.append("accountId", accountId)
    }

    const isPdf = file.name.toLowerCase().endsWith(".pdf")

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

      setBank(result.bank ?? null)
      const sessionId = result.sessionId ?? ""
      const sessionResult = await getImportSessionAction(sessionId)
      if (!sessionResult.success || !sessionResult.session) {
        setState("idle")
        setError(sessionResult.error ?? "Failed to load session")
        return
      }

      setSessionData({
        sessionId,
        candidates: sessionResult.session.data,
        bank: result.bank ?? "",
        fileName: file.name,
        categories: categoryOptions,
        projects: projectOptions,
        suggestedCategories: sessionResult.session.suggestedCategories || [],
      })
      setState("reviewing")
    } else {
      // CSV flow: parse & map → categorize
      setState("parsing")
      const result = await startCSVImportAction(formData)
      if (!result.success) {
        setState("idle")
        setError(result.error ?? "Failed to start CSV import")
        return
      }

      setBank(result.bank ?? null)

      setState("categorizing")
      const sessionId = result.sessionId ?? ""
      await categorizeSessionAction(sessionId)

      const sessionResult = await getImportSessionAction(sessionId)
      if (!sessionResult.success || !sessionResult.session) {
        setState("idle")
        setError(sessionResult.error ?? "Failed to load session")
        return
      }

      setSessionData({
        sessionId,
        candidates: sessionResult.session.data,
        bank: result.bank ?? "",
        fileName: file.name,
        categories: categoryOptions,
        projects: projectOptions,
        suggestedCategories: sessionResult.session.suggestedCategories || [],
      })
      setState("reviewing")
    }
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
    setFile(null)
    setBank(null)
    setSessionData(null)
    setError(null)
  }

  const handleReset = () => {
    setState("idle")
    setFile(null)
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* File info + bank detection */}
      {file && (
        <div className="flex items-center gap-3">
          <Badge variant="outline">{file.name}</Badge>
          {bank && (
            <span className="text-sm text-muted-foreground">
              {t("bankDetected")}: {bank}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Analyze button */}
      {file && state === "idle" && (
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
    </div>
  )
}
