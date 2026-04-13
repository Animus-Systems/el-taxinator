
import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Sparkles, Check, X, ArrowRight } from "lucide-react"
import {
  reanalyzeTransactionsAction,
  applyReanalysisAction,
} from "@/actions/reanalyze"
import type { ReanalysisChange } from "@/actions/reanalyze"
import type { SuggestedCategory } from "@/ai/import-csv"

interface ReanalyzeDialogProps {
  children: React.ReactNode
  transactionIds: string[]
  onComplete?: () => void
}

export function ReanalyzeDialog({ children, transactionIds, onComplete }: ReanalyzeDialogProps) {
  const t = useTranslations("transactions")
  const locale = useLocale()

  const [open, setOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [done, setDone] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [changes, setChanges] = useState<ReanalysisChange[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedCategory[]>([])
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [acceptedCategories, setAcceptedCategories] = useState<Set<string>>(new Set())
  const [rejectedCategories, setRejectedCategories] = useState<Set<string>>(new Set())

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && transactionIds.length > 0) {
      await runAnalysis()
    }
    if (!isOpen) {
      // Reset state on close
      setChanges([])
      setSuggestions([])
      setApprovedIds(new Set())
      setAcceptedCategories(new Set())
      setRejectedCategories(new Set())
      setFeedback("")
      setDone(false)
      setAnalyzing(false)
    }
  }

  const runAnalysis = async (feedbackText?: string) => {
    setAnalyzing(true)
    setChanges([])
    setSuggestions([])
    setDone(false)

    const result = await reanalyzeTransactionsAction(transactionIds, feedbackText)
    setAnalyzing(false)

    if (result.success) {
      setChanges(result.changes)
      setSuggestions(result.suggestions)
      // Auto-approve changed items
      const autoApproved = new Set(
        result.changes.filter((c) => c.changed).map((c) => c.transactionId)
      )
      setApprovedIds(autoApproved)
    }
  }

  const handleReanalyzeWithFeedback = async () => {
    if (!feedback.trim()) return
    await runAnalysis(feedback)
    setFeedback("")
    setAcceptedCategories(new Set())
    setRejectedCategories(new Set())
  }

  const toggleApproval = (transactionId: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev)
      if (next.has(transactionId)) {
        next.delete(transactionId)
      } else {
        next.add(transactionId)
      }
      return next
    })
  }

  const toggleAcceptCategory = (code: string) => {
    setAcceptedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
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
        setAcceptedCategories((a) => {
          const an = new Set(a)
          an.delete(code)
          return an
        })
      }
      return next
    })
  }

  const handleApplyChanges = async () => {
    const toApply = changes
      .filter((c) => approvedIds.has(c.transactionId))
      .map((c) => ({
        transactionId: c.transactionId,
        categoryCode: c.suggestedCategoryCode,
        projectCode: c.suggestedProjectCode,
        type: c.suggestedType,
      }))

    if (toApply.length === 0) return

    setApplying(true)
    const result = await applyReanalysisAction(toApply)
    setApplying(false)

    if (result.success) {
      setDone(true)
      onComplete?.()
      setTimeout(() => {
        setOpen(false)
      }, 1500)
    }
  }

  const approvedCount = approvedIds.size
  const changedCount = changes.filter((c) => c.changed).length

  const renderValue = (value?: string | null) =>
    value ? (
      <Badge variant="secondary" className="text-xs font-normal">{value}</Badge>
    ) : (
      <span className="text-muted-foreground text-xs">-</span>
    )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("reanalyzeTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("reanalyzeDesc")}</p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Loading state */}
          {analyzing && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">{t("analyzing")}</span>
            </div>
          )}

          {/* Success state */}
          {done && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-green-600">
              <Check className="h-8 w-8" />
              <span className="text-sm font-medium">{t("changesApplied")}</span>
            </div>
          )}

          {/* Results */}
          {!analyzing && !done && changes.length > 0 && (
            <>
              {/* Proposed Changes table */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  {t("proposedChanges")} — {changedCount} changed of {changes.length}
                </h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Transaction</TableHead>
                        <TableHead>{t("category")}</TableHead>
                        <TableHead>{t("project")}</TableHead>
                        <TableHead>{t("type")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changes.map((change) => (
                        <TableRow
                          key={change.transactionId}
                          className={change.changed ? "" : "opacity-50"}
                        >
                          <TableCell>
                            <Checkbox
                              checked={approvedIds.has(change.transactionId)}
                              onCheckedChange={() => toggleApproval(change.transactionId)}
                              disabled={!change.changed}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate" title={change.name ?? ""}>
                            {change.name ?? "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {renderValue(change.originalCategoryCode)}
                              {change.originalCategoryCode !== change.suggestedCategoryCode && (
                                <>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className={change.suggestedCategoryCode ? "text-green-600 font-medium text-xs" : "text-muted-foreground text-xs"}>
                                    {change.suggestedCategoryCode ?? "-"}
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {renderValue(change.originalProjectCode)}
                              {change.originalProjectCode !== change.suggestedProjectCode && (
                                <>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className={change.suggestedProjectCode ? "text-green-600 font-medium text-xs" : "text-muted-foreground text-xs"}>
                                    {change.suggestedProjectCode ?? "-"}
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {renderValue(change.originalType)}
                              {change.originalType !== change.suggestedType && (
                                <>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-green-600 font-medium text-xs">
                                    {change.suggestedType ?? "-"}
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Suggested Categories Panel */}
              {suggestions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Suggested New Categories
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {suggestions.map((sc) => {
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
                                <p className={`text-sm font-medium truncate ${isRejected ? "line-through" : ""}`}>
                                  {displayName}
                                </p>
                                <p className="text-xs text-muted-foreground">{sc.taxFormRef}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant={isAccepted ? "default" : "outline"}
                                  size="sm"
                                  className={`h-7 px-2 ${isAccepted ? "bg-green-600 hover:bg-green-700" : ""}`}
                                  onClick={() => toggleAcceptCategory(sc.code)}
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  Accept
                                </Button>
                                <Button
                                  variant={isRejected ? "destructive" : "outline"}
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => toggleRejectCategory(sc.code)}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{sc.reason}</p>
                            <Badge variant="secondary" className="text-xs">
                              {sc.affectedRowIndexes.length} transactions
                            </Badge>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Feedback area */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Textarea
                    placeholder="Provide feedback to adjust the AI analysis (e.g. 'Mark all Stripe payments as income')"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="min-h-[60px] text-sm"
                    disabled={analyzing}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReanalyzeWithFeedback}
                  disabled={analyzing || !feedback.trim()}
                >
                  {analyzing && <Loader2 className="animate-spin h-3 w-3 mr-1" />}
                  <Sparkles className="h-3 w-3 mr-1" />
                  Re-analyze with feedback
                </Button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {approvedCount} change{approvedCount !== 1 ? "s" : ""} approved
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApplyChanges}
                    disabled={applying || approvedCount === 0}
                  >
                    {applying && <Loader2 className="animate-spin h-3 w-3 mr-1" />}
                    {t("applyChanges")} ({approvedCount})
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* No suggestions from AI at all */}
          {!analyzing && !done && changes.length === 0 && transactionIds.length > 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t("noChanges")}
            </div>
          )}

          {/* No transactions selected */}
          {!analyzing && !done && transactionIds.length === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No transactions selected
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
