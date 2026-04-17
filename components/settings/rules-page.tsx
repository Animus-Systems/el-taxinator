
import { useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pencil, Trash2, Plus, ExternalLink } from "lucide-react"
import { addRuleAction, editRuleAction, deleteRuleAction, toggleRuleAction } from "@/actions/rules"
import type { CategorizationRule, Category, Project } from "@/lib/db-types"
import { trpc } from "~/trpc"

function relativeDays(date: Date | null): string | null {
  if (!date) return null
  const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

type SourceFilter = "all" | "manual" | "learned"
type UsageFilter = "all" | "active" | "unused"

interface RulesPageProps {
  rules: CategorizationRule[]
  categories: Category[]
  projects: Project[]
}

const EMPTY_FORM = {
  name: "",
  matchField: "name" as const,
  matchType: "contains" as const,
  matchValue: "",
  categoryCode: "",
  projectCode: "",
  type: "",
  note: "",
  priority: 0,
}

type FormState = typeof EMPTY_FORM

export function RulesPage({ rules, categories, projects }: RulesPageProps) {
  const t = useTranslations("settings")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const invalidateRules = () => void utils.rules.list.invalidate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all")

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false
      if (usageFilter === "active" && !r.isActive) return false
      if (usageFilter === "unused" && r.matchCount > 0) return false
      return true
    })
  }, [rules, sourceFilter, usageFilter])

  const openAdd = () => {
    setEditingRule(null)
    setForm(EMPTY_FORM)
    setError(null)
    setDialogOpen(true)
  }

  const openEdit = (rule: CategorizationRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      matchField: rule.matchField as FormState["matchField"],
      matchType: rule.matchType as FormState["matchType"],
      matchValue: rule.matchValue,
      categoryCode: rule.categoryCode ?? "",
      projectCode: rule.projectCode ?? "",
      type: rule.type ?? "",
      note: rule.note ?? "",
      priority: rule.priority,
    })
    setError(null)
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const payload = {
        name: form.name,
        matchField: form.matchField,
        matchType: form.matchType,
        matchValue: form.matchValue,
        categoryCode: form.categoryCode || null,
        projectCode: form.projectCode || null,
        type: (form.type || null) as "expense" | "income" | null,
        note: form.note || null,
        priority: form.priority,
      }

      let result
      if (editingRule) {
        result = await editRuleAction(editingRule.id, payload)
      } else {
        result = await addRuleAction(payload)
      }

      if (result.success) {
        setDialogOpen(false)
        invalidateRules()
      } else {
        setError(result.error ?? "An error occurred")
      }
    })
  }

  const handleDelete = async (rule: CategorizationRule) => {
    const ok = await confirm({
      title: t("deleteRuleConfirmTitle"),
      description: t("deleteRuleConfirm"),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    startTransition(async () => {
      await deleteRuleAction(rule.id)
      invalidateRules()
    })
  }

  const handleToggle = (rule: CategorizationRule, checked: boolean) => {
    startTransition(async () => {
      await toggleRuleAction(rule.id, checked)
      invalidateRules()
    })
  }

  const formatPattern = (rule: CategorizationRule) => {
    return `${rule.matchField} ${rule.matchType} "${rule.matchValue}"`
  }

  const getCategoryName = (code: string | null) => {
    if (!code) return "—"
    const cat = categories.find(c => c.code === code)
    if (!cat) return code
    if (typeof cat.name === "string") return cat.name
    if (typeof cat.name === "object" && cat.name !== null) {
      const nameObj = cat.name as Record<string, string>
      return nameObj["en"] ?? Object.values(nameObj)[0] ?? code
    }
    return code
  }

  const getProjectName = (code: string | null) => {
    if (!code) return "—"
    const proj = projects.find(p => p.code === code)
    if (!proj) return code
    if (typeof proj.name === "string") return proj.name
    if (typeof proj.name === "object" && proj.name !== null) {
      const nameObj = proj.name as Record<string, string>
      return nameObj["en"] ?? Object.values(nameObj)[0] ?? code
    }
    return code
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{t("filterLabel")}:</span>
          <FilterChip
            active={usageFilter === "all"}
            onClick={() => setUsageFilter("all")}
          >
            {t("filterAll")}
          </FilterChip>
          <FilterChip
            active={usageFilter === "active"}
            onClick={() => setUsageFilter("active")}
          >
            {t("filterActive")}
          </FilterChip>
          <FilterChip
            active={usageFilter === "unused"}
            onClick={() => setUsageFilter("unused")}
          >
            {t("filterUnused")}
          </FilterChip>
          <span className="ml-2 text-xs text-muted-foreground">{t("filterSource")}:</span>
          <FilterChip
            active={sourceFilter === "all"}
            onClick={() => setSourceFilter("all")}
          >
            {t("filterAll")}
          </FilterChip>
          <FilterChip
            active={sourceFilter === "manual"}
            onClick={() => setSourceFilter("manual")}
          >
            {t("ruleSourceManual")}
          </FilterChip>
          <FilterChip
            active={sourceFilter === "learned"}
            onClick={() => setSourceFilter("learned")}
          >
            {t("ruleSourceLearned")}
          </FilterChip>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t("addRule")}
        </Button>
      </div>

      {filteredRules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRules")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ruleName")}</TableHead>
              <TableHead>{t("matchField")}</TableHead>
              <TableHead>{t("categories")}</TableHead>
              <TableHead>{t("projects")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">{t("hitsColumn")}</TableHead>
              <TableHead>{t("lastUsedColumn")}</TableHead>
              <TableHead>{t("ruleActive")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRules.map(rule => {
              const lastUsed = relativeDays(rule.lastAppliedAt)
              return (
                <TableRow
                  key={rule.id}
                  className={rule.source === "learned" ? "text-muted-foreground" : undefined}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/settings/rules/${rule.id}`}
                      className="hover:underline"
                    >
                      {rule.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{formatPattern(rule)}</TableCell>
                  <TableCell>{getCategoryName(rule.categoryCode)}</TableCell>
                  <TableCell>{getProjectName(rule.projectCode)}</TableCell>
                  <TableCell>{rule.type ?? "—"}</TableCell>
                  <TableCell>
                    {rule.source === "learned" ? (
                      <Badge
                        variant="secondary"
                        className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        title={rule.learnReason ? t("learnedBecause", { reason: rule.learnReason }) : undefined}
                      >
                        {t("ruleSourceLearned")}
                        {rule.source === "learned" ? (
                          <span className="ml-1 opacity-70">
                            {Math.round(rule.confidence * 100)}%
                          </span>
                        ) : null}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {t("ruleSourceManual")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rule.matchCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lastUsed ?? t("neverUsed")}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={checked => handleToggle(rule, checked)}
                      disabled={isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title={t("viewMatches")}
                      >
                        <Link href={`/settings/rules/${rule.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(rule)}
                        title={t("editItem", { name: rule.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(rule)}
                        disabled={isPending}
                        title={t("deleteItem", { name: rule.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? t("editRule") : t("addRule")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="rule-name">{t("ruleName")}</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t("ruleName")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("matchField")}</Label>
                <Select
                  value={form.matchField}
                  onValueChange={v => setForm(f => ({ ...f, matchField: v as FormState["matchField"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">{t("fieldName")}</SelectItem>
                    <SelectItem value="merchant">{t("fieldMerchant")}</SelectItem>
                    <SelectItem value="description">{t("fieldDescription")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>{t("matchType")}</Label>
                <Select
                  value={form.matchType}
                  onValueChange={v => setForm(f => ({ ...f, matchType: v as FormState["matchType"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">{t("matchContains")}</SelectItem>
                    <SelectItem value="starts_with">{t("matchStartsWith")}</SelectItem>
                    <SelectItem value="exact">{t("matchExact")}</SelectItem>
                    <SelectItem value="regex">{t("matchRegex")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-match-value">{t("matchValue")}</Label>
              <Input
                id="rule-match-value"
                value={form.matchValue}
                onChange={e => setForm(f => ({ ...f, matchValue: e.target.value }))}
                placeholder={t("matchValue")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("categories")}</Label>
                <Select
                  value={form.categoryCode || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, categoryCode: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.code} value={cat.code}>
                        {getCategoryName(cat.code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>{t("projects")}</Label>
                <Select
                  value={form.projectCode || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, projectCode: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {projects.map(proj => (
                      <SelectItem key={proj.code} value={proj.code}>
                        {getProjectName(proj.code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("type")}</Label>
                <Select
                  value={form.type || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, type: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Auto</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="rule-priority">{t("rulePriority")}</Label>
                <Input
                  id="rule-priority"
                  type="number"
                  min={0}
                  max={1000}
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-note">Note</Label>
              <Input
                id="rule-note"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Optional note"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? t("saving") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted")
      }
    >
      {children}
    </button>
  )
}
