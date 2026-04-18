import { useParams } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { getLocalizedValue } from "@/lib/i18n-db"
import type { Transaction } from "@/lib/db-types"

function relativeDays(date: Date | null): string {
  if (!date) return "never"
  const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function formatCurrency(value: number | null, code: string | null): string {
  if (value === null || value === undefined) return "—"
  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: code || "EUR",
    maximumFractionDigits: 2,
  })
  return formatter.format(value / 100)
}

export function RuleDetailPage() {
  const { t, i18n } = useTranslation("settings")
  const { ruleId } = useParams({ strict: false }) as { ruleId: string }

  const { data, isLoading } = trpc.rules.getById.useQuery(
    { id: ruleId, matchLimit: 50 },
    { enabled: !!ruleId },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-6">
        <Link href="/settings/rules" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("rules")}
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">Rule not found.</p>
      </div>
    )
  }

  const { rule, matches } = data
  const pattern = `${rule.matchField} ${rule.matchType} "${rule.matchValue}"`

  return (
    <div className="space-y-6 py-4">
      <Link
        href="/settings/rules"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("rules")}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold">{getLocalizedValue(rule.name, i18n.language)}</h1>
          {rule.source === "learned" ? (
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              {t("ruleSourceLearned")} · {Math.round(rule.confidence * 100)}%
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            >
              {t("ruleSourceManual")}
            </Badge>
          )}
          {!rule.isActive && <Badge variant="outline">inactive</Badge>}
        </div>
        <div className="text-sm text-muted-foreground">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{pattern}</code>
          {rule.categoryCode ? (
            <span className="ml-3">
              → <strong>{rule.categoryCode}</strong>
            </span>
          ) : null}
          {rule.projectCode ? (
            <span className="ml-3">
              project <strong>{rule.projectCode}</strong>
            </span>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
          <span>
            {t("hitsColumn")}: <strong className="tabular-nums">{rule.matchCount}</strong>
          </span>
          <span>
            {t("lastUsedColumn")}:{" "}
            <strong>{relativeDays(rule.lastAppliedAt)}</strong>
          </span>
          {rule.learnReason ? (
            <span className="italic max-w-lg">
              {t("learnedBecause", { reason: rule.learnReason })}
            </span>
          ) : null}
        </div>
      </header>

      <section>
        <h2 className="text-lg font-medium mb-3">
          {t("detailMatchedTransactions", { count: matches.length })}
        </h2>
        {matches.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No transactions matched by this rule yet. New imports will populate this list.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-1.5">
            {matches.map((tx: Transaction) => (
              <li key={tx.id}>
                <Link
                  href={`/transactions/${tx.id}`}
                  className="flex items-center justify-between gap-3 rounded border border-border/40 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {tx.issuedAt ? new Date(tx.issuedAt).toLocaleDateString() : "—"}
                    </span>
                    <span className="truncate font-medium">
                      {tx.merchant || tx.name || tx.description || "(untitled)"}
                    </span>
                    {tx.categoryCode ? (
                      <Badge variant="outline" className="text-[10px]">
                        {tx.categoryCode}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="tabular-nums">
                    {formatCurrency(tx.total, tx.currencyCode)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
