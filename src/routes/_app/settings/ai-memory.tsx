import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useConfirm } from "@/components/ui/confirm-dialog"
import type { BusinessFact } from "@/lib/db-types"

type SourceFilter = "all" | "wizard" | "user" | "inferred"

const SOURCE_FILTERS: SourceFilter[] = ["all", "wizard", "user", "inferred"]

// Values beyond this line count get collapsed behind a "Show more" button.
const COLLAPSE_LINE_LIMIT = 4

const sourceBadgeClass: Record<BusinessFact["source"], string> = {
  user: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  wizard: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  inferred: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
}

function humanizeKey(key: string): string {
  return key
    .split(":")
    .map((segment) =>
      segment
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )
    .join(" · ")
}

function formatConfidence(confidence: number | undefined): string | null {
  if (typeof confidence !== "number") return null
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100)
  return `${pct}%`
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  return dt.toLocaleDateString()
}

type FactCardProps = {
  fact: BusinessFact
  isEditing: boolean
  draftText: string
  pending: boolean
  onStartEdit: () => void
  onDraftChange: (value: string) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: () => void
  labels: {
    source: string
    actionSave: string
    actionCancel: string
    actionEdit: string
    actionDelete: string
    showMore: string
    showLess: string
    confidencePrefix: string
    updatedPrefix: string
  }
}

function FactCard({
  fact,
  isEditing,
  draftText,
  pending,
  onStartEdit,
  onDraftChange,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  labels,
}: FactCardProps) {
  const [expanded, setExpanded] = useState(false)
  const lineCount = useMemo(() => fact.value.text.split("\n").length, [fact.value.text])
  const characterHeuristicLong = fact.value.text.length > 220
  const isCollapsible = !isEditing && (lineCount > COLLAPSE_LINE_LIMIT || characterHeuristicLong)
  const confidence = formatConfidence(fact.value.confidence)

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium text-foreground">{humanizeKey(fact.key)}</div>
            <code className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {fact.key}
            </code>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onSaveEdit}
                  disabled={!draftText.trim() || pending}
                  title={labels.actionSave}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCancelEdit}
                  disabled={pending}
                  title={labels.actionCancel}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onStartEdit}
                  title={labels.actionEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  title={labels.actionDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <Textarea
            value={draftText}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={Math.min(Math.max(lineCount + 1, 3), 16)}
            autoFocus
            className="text-sm leading-relaxed"
          />
        ) : (
          <div>
            <p
              className={
                isCollapsible && !expanded
                  ? "line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                  : "whitespace-pre-wrap text-sm leading-relaxed text-foreground"
              }
            >
              {fact.value.text}
            </p>
            {isCollapsible && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    {labels.showLess}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    {labels.showMore}
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {fact.value.examples && fact.value.examples.length > 0 && !isEditing && (
          <div className="flex flex-wrap gap-1">
            {fact.value.examples.map((ex, i) => (
              <span
                key={i}
                className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {ex}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className={sourceBadgeClass[fact.source]}>
            {labels.source}
          </Badge>
          {confidence !== null && (
            <span>
              {labels.confidencePrefix} <span className="tabular-nums">{confidence}</span>
            </span>
          )}
          <span className="ml-auto">
            {labels.updatedPrefix} {formatDate(fact.updatedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function AiMemorySettingsPage() {
  const { t } = useTranslation("aiMemory")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [filter, setFilter] = useState<SourceFilter>("all")
  const [search, setSearch] = useState("")
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftText, setDraftText] = useState("")
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")

  const { data: facts = [], isLoading } = trpc.wizard.listBusinessFacts.useQuery({})

  const saveFact = trpc.wizard.saveBusinessFact.useMutation({
    onSuccess: () => {
      void utils.wizard.listBusinessFacts.invalidate()
      setEditingKey(null)
      setCreating(false)
      setNewKey("")
      setNewValue("")
    },
  })

  const deleteFact = trpc.wizard.deleteBusinessFact.useMutation({
    onSuccess: () => void utils.wizard.listBusinessFacts.invalidate(),
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return facts.filter((f) => {
      if (filter !== "all" && f.source !== filter) return false
      if (!q) return true
      return (
        f.key.toLowerCase().includes(q) ||
        f.value.text.toLowerCase().includes(q)
      )
    })
  }, [facts, filter, search])

  const countsBySource = useMemo(() => {
    const counts: Record<SourceFilter, number> = { all: facts.length, wizard: 0, user: 0, inferred: 0 }
    for (const f of facts) counts[f.source]++
    return counts
  }, [facts])

  const filterLabel: Record<SourceFilter, string> = {
    all: t("filterAll"),
    wizard: t("sourceWizard"),
    user: t("sourceUser"),
    inferred: t("sourceInferred"),
  }

  const openEdit = (fact: BusinessFact) => {
    setEditingKey(fact.key)
    setDraftText(fact.value.text)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setDraftText("")
  }

  const saveEdit = (fact: BusinessFact) => {
    const text = draftText.trim()
    if (!text) return
    saveFact.mutate({
      key: fact.key,
      value: {
        text,
        ...(fact.value.confidence !== undefined ? { confidence: fact.value.confidence } : {}),
        ...(fact.value.examples !== undefined ? { examples: fact.value.examples } : {}),
      },
      source: "user",
    })
  }

  const handleDelete = async (fact: BusinessFact) => {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirmBody", { key: fact.key }),
      confirmLabel: t("actionDelete"),
      variant: "destructive",
    })
    if (!ok) return
    deleteFact.mutate({ key: fact.key })
  }

  const saveNew = () => {
    const key = newKey.trim()
    const text = newValue.trim()
    if (!key || !text) return
    saveFact.mutate({
      key,
      value: { text },
      source: "user",
    })
  }

  const sourceLabelFor = (source: BusinessFact["source"]): string => {
    if (source === "wizard") return t("sourceWizard")
    if (source === "user") return t("sourceUser")
    return t("sourceInferred")
  }

  return (
    <div className="w-full space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <Badge variant="secondary">{facts.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
                filter === f
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              <span>{filterLabel[f]}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  filter === f ? "bg-background/20" : "bg-background/60"
                }`}
              >
                {countsBySource[f]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 md:w-96">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreating((v) => !v)
              setNewKey("")
              setNewValue("")
            }}
            disabled={saveFact.isPending}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addFact")}
          </Button>
        </div>
      </div>

      {creating && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={t("keyPlaceholder")}
              className="font-mono text-sm"
            />
            <Textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={t("valuePlaceholder")}
              rows={3}
              className="text-sm leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false)
                  setNewKey("")
                  setNewValue("")
                }}
                disabled={saveFact.isPending}
              >
                {t("actionCancel")}
              </Button>
              <Button
                size="sm"
                onClick={saveNew}
                disabled={!newKey.trim() || !newValue.trim() || saveFact.isPending}
              >
                {saveFact.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {t("actionSave")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
          <p className="text-sm">{t("empty")}</p>
          <p className="text-xs">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              isEditing={editingKey === fact.key}
              draftText={draftText}
              pending={saveFact.isPending}
              onStartEdit={() => openEdit(fact)}
              onDraftChange={setDraftText}
              onCancelEdit={cancelEdit}
              onSaveEdit={() => saveEdit(fact)}
              onDelete={() => void handleDelete(fact)}
              labels={{
                source: sourceLabelFor(fact.source),
                actionSave: t("actionSave"),
                actionCancel: t("actionCancel"),
                actionEdit: t("actionEdit"),
                actionDelete: t("actionDelete"),
                showMore: t("showMore"),
                showLess: t("showLess"),
                confidencePrefix: t("confidencePrefix"),
                updatedPrefix: t("updatedPrefix"),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
