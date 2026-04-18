
import { useState, useCallback, useEffect, useRef } from "react"
import { useTranslations, useLocale } from "next-intl"
import type { TransactionCandidate, SuggestedCategory } from "@/ai/import-csv"
import {
  commitImportAction,
  cancelImportAction,
  saveReviewSessionAction,
} from "@/actions/ai-import"
import { addRuleAction } from "@/actions/rules"
import { buildI18nRuleName } from "@/lib/rules-i18n-name"
import { summarizeImportCandidates, validateImportCommit } from "@/lib/import-review"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Check,
  X,
  Sparkles,
} from "lucide-react"

const PAGE_SIZE = 50

type Props = {
  sessionId: string
  candidates: TransactionCandidate[]
  bank: string
  fileName: string
  categories: Array<{ code: string; name: string }>
  projects: Array<{ code: string; name: string }>
  suggestedCategories: SuggestedCategory[]
  onRecategorize: (feedback: string, reviewedCandidates: TransactionCandidate[]) => Promise<void>
  onComplete: () => void
  onCancel: () => void
}

export function ReviewTable({
  sessionId,
  candidates: initialCandidates,
  bank,
  fileName,
  categories,
  projects,
  suggestedCategories,
  onRecategorize,
  onComplete,
  onCancel,
}: Props) {
  const t = useTranslations("settings")
  const locale = useLocale()
  const [candidates, setCandidates] = useState(() =>
    initialCandidates.map((candidate) => ({
      ...candidate,
      status: candidate.status ?? "needs_review",
      suggestedStatus: candidate.suggestedStatus ?? null,
      confidence: {
        category: candidate.confidence?.category ?? 0,
        type: candidate.confidence?.type ?? 0,
        status: candidate.confidence?.status ?? 0,
        overall: candidate.confidence?.overall ?? 0,
      },
      selected: candidate.selected ?? true,
    })),
  )
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialCandidates.filter((c) => c.selected).map((c) => c.rowIndex))
  )
  const [page, setPage] = useState(0)
  const [showNeedsReviewOnly, setShowNeedsReviewOnly] = useState(false)
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number
    field: string
  } | null>(null)
  const [importing, setImporting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [importErrors, setImportErrors] = useState<Array<{
    rowIndex: number
    code: string
    message: string
  }>>([])

  // Suggested categories state
  const [acceptedCategories, setAcceptedCategories] = useState<Set<string>>(new Set())
  const [rejectedCategories, setRejectedCategories] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState("")
  const [isRecategorizing, setIsRecategorizing] = useState(false)

  // Inline rule creation state
  const [categoryChangedRows, setCategoryChangedRows] = useState<Set<number>>(new Set())
  const [ruleCreatingRows, setRuleCreatingRows] = useState<Set<number>>(new Set())
  const [ruleCreatedRows, setRuleCreatedRows] = useState<Set<number>>(new Set())
  const skipAutosaveRef = useRef(true)

  const normalizeCandidate = useCallback(
    (candidate: TransactionCandidate): TransactionCandidate => ({
      ...candidate,
      status: candidate.status ?? "needs_review",
      suggestedStatus: candidate.suggestedStatus ?? null,
      confidence: {
        category: candidate.confidence?.category ?? 0,
        type: candidate.confidence?.type ?? 0,
        status: candidate.confidence?.status ?? 0,
        overall: candidate.confidence?.overall ?? 0,
      },
      selected: candidate.selected ?? true,
    }),
    [],
  )

  const buildReviewedCandidates = useCallback(
    (baseCandidates: TransactionCandidate[], baseSelected: Set<number>) =>
      baseCandidates.map((candidate) => ({
        ...normalizeCandidate(candidate),
        selected: baseSelected.has(candidate.rowIndex),
      })),
    [normalizeCandidate],
  )

  // Sync candidates when parent passes updated data (e.g. after recategorization)
  useEffect(() => {
    skipAutosaveRef.current = true
    const normalizedCandidates = initialCandidates.map(normalizeCandidate)
    setCandidates(normalizedCandidates)
    setSelected(new Set(normalizedCandidates.filter((c) => c.selected).map((c) => c.rowIndex)))
    setImportErrors([])
  }, [initialCandidates, normalizeCandidate])

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false
      return
    }

    const reviewedCandidates = buildReviewedCandidates(candidates, selected)
    const timeoutId = window.setTimeout(async () => {
      setSaving(true)
      setSaveError(null)
      const result = await saveReviewSessionAction(sessionId, reviewedCandidates)
      if (!result.success) {
        setSaveError(result.error ?? "Failed to save review")
      }
      setSaving(false)
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [buildReviewedCandidates, candidates, selected, sessionId])

  const reviewedCandidates = buildReviewedCandidates(candidates, selected)
  const summary = summarizeImportCandidates(reviewedCandidates)

  const displayed = showNeedsReviewOnly
    ? candidates.filter((c) => c.status === "needs_review")
    : candidates
  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const pageRows = displayed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const selectedTotal = reviewedCandidates
    .filter((c) => c.selected)
    .reduce((sum, c) => sum + (c.total ?? 0), 0)

  const defaultCurrency =
    candidates.find((c) => c.currencyCode)?.currencyCode ?? "EUR"

  const updateCandidate = useCallback(
    (rowIndex: number, field: string, value: unknown) => {
      setImportErrors([])
      setCandidates((prev) =>
        prev.map((c) =>
          c.rowIndex === rowIndex ? { ...c, [field]: value } : c
        )
      )
    },
    []
  )

  const toggleSelect = (rowIndex: number) => {
    setImportErrors([])
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  const selectAll = () => {
    setImportErrors([])
    setSelected(new Set(candidates.map((c) => c.rowIndex)))
  }

  const deselectAll = () => {
    setImportErrors([])
    setSelected(new Set())
  }

  const handleImport = async () => {
    const validation = validateImportCommit(reviewedCandidates)
    if (!validation.ok) {
      setImportErrors(validation.errors)
      return
    }

    setImporting(true)
    setSaveError(null)
    // Collect accepted suggested categories to create
    const acceptedCats = suggestedCategories
      .filter((sc) => acceptedCategories.has(sc.code))
      .map((sc) => ({
        code: sc.code,
        name: sc.name,
        taxFormRef: sc.taxFormRef,
        reason: sc.reason,
      }))
    await saveReviewSessionAction(sessionId, reviewedCandidates)
    const result = await commitImportAction(
      sessionId,
      Array.from(selected),
      reviewedCandidates,
      acceptedCats.length > 0 ? acceptedCats : undefined,
    )
    setImporting(false)
    if (result.success) {
      onComplete()
      return
    }

    setImportErrors(result.validationErrors ?? [])
    setSaveError(result.error ?? "Import failed")
  }

  const handleRecategorize = async () => {
    if (!feedback.trim()) return
    setIsRecategorizing(true)
    await saveReviewSessionAction(sessionId, reviewedCandidates)
    await onRecategorize(feedback, reviewedCandidates)
    setFeedback("")
    setIsRecategorizing(false)
    // Reset accepted/rejected since suggestions may have changed
    setAcceptedCategories(new Set())
    setRejectedCategories(new Set())
  }

  const toggleAcceptCategory = (code: string) => {
    setAcceptedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
        // Remove from rejected if it was there
        setRejectedCategories((r) => {
          const rn = new Set(r)
          rn.delete(code)
          return rn
        })
      }
      return next
    })
  }

  const toggleRejectCategory = (code: string) => {
    setRejectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
        // Remove from accepted if it was there
        setAcceptedCategories((a) => {
          const an = new Set(a)
          an.delete(code)
          return an
        })
      }
      return next
    })
  }

  const handleCategoryChangeWithRule = async (
    rowIndex: number,
    newCategoryCode: string | null,
  ) => {
    updateCandidate(rowIndex, "categoryCode", newCategoryCode)
    // Track that this row had its category changed
    setCategoryChangedRows((prev) => {
      const next = new Set(prev)
      next.add(rowIndex)
      return next
    })
    // Clear any previous rule-created state for this row
    setRuleCreatedRows((prev) => {
      const next = new Set(prev)
      next.delete(rowIndex)
      return next
    })
  }

  const handleCreateRule = async (row: TransactionCandidate) => {
    if (!row.categoryCode) return
    setRuleCreatingRows((prev) => {
      const next = new Set(prev)
      next.add(row.rowIndex)
      return next
    })
    const categoryName = categories.find((c) => c.code === row.categoryCode)?.name ?? row.categoryCode
    const matchField = row.merchant ? "merchant" : "name"
    const matchValue = row.merchant || row.name
    if (!matchValue) {
      setRuleCreatingRows((prev) => {
        const next = new Set(prev)
        next.delete(row.rowIndex)
        return next
      })
      return
    }
    await addRuleAction({
      name: buildI18nRuleName("ruleNameForCategory", {
        category: categoryName,
        value: matchValue,
      }),
      matchType: "contains",
      matchField,
      matchValue,
      categoryCode: row.categoryCode,
      projectCode: row.projectCode,
      type: row.type,
      status: row.status === "needs_review" ? null : row.status,
    })
    setRuleCreatingRows((prev) => {
      const next = new Set(prev)
      next.delete(row.rowIndex)
      return next
    })
    setRuleCreatedRows((prev) => {
      const next = new Set(prev)
      next.add(row.rowIndex)
      return next
    })
    // Remove from changed rows since rule is now created
    setCategoryChangedRows((prev) => {
      const next = new Set(prev)
      next.delete(row.rowIndex)
      return next
    })
  }

  const handleCancel = async () => {
    setCancelling(true)
    await cancelImportAction(sessionId)
    setCancelling(false)
    onCancel()
  }

  const confidenceDot = (confidence: number) => {
    if (confidence > 0.8)
      return <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
    if (confidence >= 0.5)
      return <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
    return <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
  }

  const renderEditableText = (
    row: TransactionCandidate,
    field: "name" | "merchant",
    value: string | null
  ) => {
    const isEditing =
      editingCell?.rowIndex === row.rowIndex && editingCell.field === field
    if (isEditing) {
      return (
        <Input
          autoFocus
          defaultValue={value ?? ""}
          className="h-7 text-xs"
          onBlur={(e) => {
            updateCandidate(row.rowIndex, field, e.target.value || null)
            setEditingCell(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateCandidate(
                row.rowIndex,
                field,
                (e.target as HTMLInputElement).value || null
              )
              setEditingCell(null)
            }
            if (e.key === "Escape") setEditingCell(null)
          }}
        />
      )
    }
    return (
      <span
        className="cursor-pointer hover:underline truncate block max-w-[160px]"
        title={value ?? ""}
        onClick={() => setEditingCell({ rowIndex: row.rowIndex, field })}
      >
        {value || "-"}
      </span>
    )
  }

  const renderEditableNumber = (row: TransactionCandidate) => {
    const isEditing =
      editingCell?.rowIndex === row.rowIndex && editingCell.field === "total"
    if (isEditing) {
      return (
        <Input
          autoFocus
          type="number"
          step="0.01"
          defaultValue={row.total != null ? (row.total / 100).toFixed(2) : ""}
          className="h-7 text-xs w-24"
          onBlur={(e) => {
            const val = parseFloat(e.target.value)
            updateCandidate(
              row.rowIndex,
              "total",
              isNaN(val) ? null : Math.round(val * 100)
            )
            setEditingCell(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = parseFloat((e.target as HTMLInputElement).value)
              updateCandidate(
                row.rowIndex,
                "total",
                isNaN(val) ? null : Math.round(val * 100)
              )
              setEditingCell(null)
            }
            if (e.key === "Escape") setEditingCell(null)
          }}
        />
      )
    }
    return (
      <span
        className="cursor-pointer hover:underline"
        onClick={() =>
          setEditingCell({ rowIndex: row.rowIndex, field: "total" })
        }
      >
        {row.total != null
          ? formatCurrency(row.total, row.currencyCode ?? defaultCurrency)
          : "-"}
      </span>
    )
  }

  const renderEditableDate = (row: TransactionCandidate) => {
    const isEditing =
      editingCell?.rowIndex === row.rowIndex && editingCell.field === "issuedAt"
    if (isEditing) {
      return (
        <Input
          autoFocus
          type="date"
          defaultValue={row.issuedAt?.slice(0, 10) ?? ""}
          className="h-7 text-xs w-32"
          onBlur={(e) => {
            updateCandidate(row.rowIndex, "issuedAt", e.target.value || null)
            setEditingCell(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditingCell(null)
          }}
        />
      )
    }
    return (
      <span
        className="cursor-pointer hover:underline"
        onClick={() =>
          setEditingCell({ rowIndex: row.rowIndex, field: "issuedAt" })
        }
      >
        {row.issuedAt?.slice(0, 10) ?? "-"}
      </span>
    )
  }

  const formatStatusTotals = (totals: Record<string, number>) => {
    const entries = Object.entries(totals)
    if (entries.length === 0) return "-"
    return entries
      .map(([currencyCode, total]) => formatCurrency(total, currencyCode))
      .join(", ")
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="outline">{bank}</Badge>
          <span className="text-muted-foreground">{fileName}</span>
          <span className="text-muted-foreground">
            {candidates.length} rows
          </span>
          <span className="font-medium">
            {selected.size} selected
          </span>
          <span className="font-medium">
            {formatCurrency(selectedTotal, defaultCurrency)}
          </span>
          {saving && <span className="text-xs text-muted-foreground">Saving review...</span>}
          {!saving && !saveError && <span className="text-xs text-muted-foreground">Review saved</span>}
          {saveError && <span className="text-xs text-destructive">{saveError}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {t("selectAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            {t("deselectAll")}
          </Button>
          <Button
            variant={showNeedsReviewOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setShowNeedsReviewOnly(!showNeedsReviewOnly)
              setPage(0)
            }}
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            {showNeedsReviewOnly ? t("showAll") : "Needs review"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling || importing}
          >
            {cancelling && <Loader2 className="animate-spin h-3 w-3 mr-1" />}
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={importing || selected.size === 0}
          >
            {importing && <Loader2 className="animate-spin h-3 w-3 mr-1" />}
            {t("importSelected")} ({selected.size})
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Needs review</p>
            <p className="text-lg font-semibold">{summary.counts.needs_review}</p>
            <p className="text-xs text-muted-foreground">{formatStatusTotals(summary.totals.needs_review)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Business</p>
            <p className="text-lg font-semibold">{summary.counts.business}</p>
            <p className="text-xs text-muted-foreground">{formatStatusTotals(summary.totals.business)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Non-deductible</p>
            <p className="text-lg font-semibold">{summary.counts.business_non_deductible}</p>
            <p className="text-xs text-muted-foreground">
              {formatStatusTotals(summary.totals.business_non_deductible)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Personal (taxable)</p>
            <p className="text-lg font-semibold">{summary.counts.personal_taxable}</p>
            <p className="text-xs text-muted-foreground">
              {formatStatusTotals(summary.totals.personal_taxable)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Personal (ignored)</p>
            <p className="text-lg font-semibold">{summary.counts.personal_ignored}</p>
            <p className="text-xs text-muted-foreground">{formatStatusTotals(summary.totals.personal_ignored)}</p>
          </CardContent>
        </Card>
      </div>

      {importErrors.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-medium text-destructive">Review incomplete</p>
            <div className="space-y-1">
              {importErrors.slice(0, 5).map((error) => (
                <p key={`${error.rowIndex}-${error.code}`} className="text-xs text-muted-foreground">
                  Row {error.rowIndex + 1}: {error.message}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested Categories Panel */}
      {suggestedCategories.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" />
              {t("suggestedCategories")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("suggestedCategoriesDesc")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestedCategories.map((sc) => {
              const isAccepted = acceptedCategories.has(sc.code)
              const isRejected = rejectedCategories.has(sc.code)
              const displayName = locale === "es" ? sc.name.es : sc.name.en
              return (
                <Card
                  key={sc.code}
                  className={
                    isAccepted
                      ? "border-green-500"
                      : isRejected
                        ? "opacity-50"
                        : ""
                  }
                >
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${isRejected ? "line-through" : ""}`}
                        >
                          {displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sc.taxFormRef}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant={isAccepted ? "default" : "outline"}
                          size="sm"
                          className={`h-7 px-2 ${isAccepted ? "bg-green-600 hover:bg-green-700" : ""}`}
                          onClick={() => toggleAcceptCategory(sc.code)}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {t("acceptCategory")}
                        </Button>
                        <Button
                          variant={isRejected ? "destructive" : "outline"}
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => toggleRejectCategory(sc.code)}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("rejectCategory")}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {sc.reason}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {t("affectedTransactions", { count: sc.affectedRowIndexes.length })}
                    </Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Textarea
                placeholder={t("feedbackPlaceholder")}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[60px] text-sm"
                disabled={isRecategorizing}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecategorize}
              disabled={isRecategorizing || !feedback.trim()}
            >
              {isRecategorizing && <Loader2 className="animate-spin h-3 w-3 mr-1" />}
              {isRecategorizing ? t("recategorizing") : t("reanalyzeWithFeedback")}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="w-8" />
              <TableHead>{t("name")}</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Project</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={row.rowIndex}
                className={row.status === "needs_review" ? "bg-amber-50/50" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(row.rowIndex)}
                    onCheckedChange={() => toggleSelect(row.rowIndex)}
                  />
                </TableCell>
                <TableCell>
                  {confidenceDot(row.confidence.overall)}
                </TableCell>
                <TableCell>
                  {renderEditableText(row, "name", row.name)}
                </TableCell>
                <TableCell>
                  {renderEditableText(row, "merchant", row.merchant)}
                </TableCell>
                <TableCell className="text-right">
                  {renderEditableNumber(row)}
                </TableCell>
                <TableCell>{renderEditableDate(row)}</TableCell>
                <TableCell>
                  <Select
                    value={row.type ?? "expense"}
                    onValueChange={(v) =>
                      updateCandidate(row.rowIndex, "type", v)
                    }
                  >
                    <SelectTrigger className="h-7 text-xs w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Select
                      value={row.status}
                      onValueChange={(value) => updateCandidate(row.rowIndex, "status", value)}
                    >
                      <SelectTrigger className="h-7 text-xs w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="needs_review">Needs review</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="business_non_deductible">
                          Business, non-deductible
                        </SelectItem>
                        <SelectItem value="personal_taxable">Personal (taxable)</SelectItem>
                        <SelectItem value="personal_ignored">Personal (ignored)</SelectItem>
                      </SelectContent>
                    </Select>
                    {row.suggestedStatus && row.status === "needs_review" && (
                      <span className="text-[10px] text-muted-foreground">
                        Suggested: {row.suggestedStatus}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Select
                      value={row.categoryCode ?? "__none__"}
                      onValueChange={(v) =>
                        handleCategoryChangeWithRule(
                          row.rowIndex,
                          v === "__none__" ? null : v,
                        )
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.code} value={cat.code}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {categoryChangedRows.has(row.rowIndex) && row.categoryCode && row.name && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          className="h-3 w-3"
                          disabled={ruleCreatingRows.has(row.rowIndex)}
                          onCheckedChange={(checked) => {
                            if (checked) handleCreateRule(row)
                          }}
                        />
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          {t("alwaysApplyRule")}
                        </span>
                      </label>
                    )}
                    {ruleCreatedRows.has(row.rowIndex) && (
                      <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                        <Check className="h-2.5 w-2.5" />
                        {t("ruleCreated")}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={row.projectCode ?? "__none__"}
                    onValueChange={(v) =>
                      updateCandidate(
                        row.rowIndex,
                        "projectCode",
                        v === "__none__" ? null : v
                      )
                    }
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-</SelectItem>
                      {projects.map((proj) => (
                        <SelectItem key={proj.code} value={proj.code}>
                          {proj.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
