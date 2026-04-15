import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, CheckCircle2, RotateCcw, BookOpen } from "lucide-react"
import type { KnowledgePack } from "@/lib/db-types"

export function KnowledgeSettingsPage() {
  const { t } = useTranslation("knowledge")
  const utils = trpc.useUtils()
  const { data: packs = [], isLoading } = trpc.knowledge.list.useQuery()
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastDiff, setLastDiff] = useState<{ slug: string; summary: string } | null>(null)

  const refresh = trpc.knowledge.refresh.useMutation({
    onMutate: ({ slug }) => {
      setRefreshingSlug(slug)
      setRefreshError(null)
    },
    onSuccess: (result) => {
      setRefreshingSlug(null)
      utils.knowledge.list.invalidate()
      utils.knowledge.hasStale.invalidate()
      setLastDiff({
        slug: result.pack.slug,
        summary: `${result.diffSummary.sizeBefore} → ${result.diffSummary.sizeAfter} chars · ${result.diffSummary.headingCountBefore} → ${result.diffSummary.headingCountAfter} headings · ${result.provider}`,
      })
    },
    onError: (err) => {
      setRefreshingSlug(null)
      setRefreshError(err.message)
    },
  })

  const markVerified = trpc.knowledge.markVerified.useMutation({
    onSuccess: () => utils.knowledge.list.invalidate(),
  })

  const resetToSeed = trpc.knowledge.resetToSeed.useMutation({
    onSuccess: () => utils.knowledge.list.invalidate(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 py-4">
      <header>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Curated knowledge the AI accountant consults during wizard sessions. Refresh each pack
          periodically so tax rates and deadlines stay current — refresh uses your configured
          LLM (same as the wizard).
        </p>
      </header>

      {refreshError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {refreshError}
        </div>
      ) : null}

      {lastDiff ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
          Refreshed <strong>{lastDiff.slug}</strong> — {lastDiff.summary}. Review the new content
          below and click <em>Mark verified</em> once you're comfortable.
        </div>
      ) : null}

      {packs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No knowledge packs yet. They'll appear here on next page load.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {packs.map((p: KnowledgePack) => (
            <PackCard
              key={p.slug}
              pack={p}
              expanded={expandedSlug === p.slug}
              onToggle={() => setExpandedSlug((s) => (s === p.slug ? null : p.slug))}
              onRefresh={() => refresh.mutate({ slug: p.slug })}
              onMarkVerified={() => markVerified.mutate({ slug: p.slug })}
              onResetSeed={() => {
                if (window.confirm("Reset this pack to the shipped seed content?")) {
                  resetToSeed.mutate({ slug: p.slug })
                }
              }}
              isRefreshing={refreshingSlug === p.slug}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PackCard({
  pack,
  expanded,
  onToggle,
  onRefresh,
  onMarkVerified,
  onResetSeed,
  isRefreshing,
  t,
}: {
  pack: KnowledgePack
  expanded: boolean
  onToggle: () => void
  onRefresh: () => void
  onMarkVerified: () => void
  onResetSeed: () => void
  isRefreshing: boolean
  t: (k: string) => string
}) {
  const days = pack.lastRefreshedAt
    ? Math.floor((Date.now() - new Date(pack.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const stale = days === null || days >= pack.refreshIntervalDays

  const statusBadge = (() => {
    if (pack.reviewStatus === "seed") return <Badge variant="outline">{t("seedBadge")}</Badge>
    if (pack.reviewStatus === "needs_review") {
      return <Badge variant="secondary">{t("needsReviewBadge")}</Badge>
    }
    if (pack.reviewStatus === "verified") {
      return <Badge variant="default">{t("verifiedBadge")}</Badge>
    }
    return <Badge variant="outline">{pack.reviewStatus}</Badge>
  })()

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{pack.title}</h3>
              {statusBadge}
              {stale ? <Badge variant="destructive">{t("staleBadge")}</Badge> : null}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
              <span>slug: <code className="text-[11px]">{pack.slug}</code></span>
              <span>
                {t("lastRefreshed")}:{" "}
                {pack.lastRefreshedAt
                  ? new Date(pack.lastRefreshedAt).toLocaleDateString()
                  : "—"}
                {days !== null ? ` (${days}d ago)` : ""}
              </span>
              {pack.provider ? (
                <span>
                  {t("provider")}: {pack.provider}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              {isRefreshing ? t("refreshing") : t("refreshNow")}
            </Button>
            {pack.reviewStatus === "needs_review" ? (
              <Button variant="outline" size="sm" onClick={onMarkVerified}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {t("markVerified")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onResetSeed}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {t("resetSeed")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggle}>
              {expanded ? "Hide" : "Preview"}
            </Button>
          </div>
        </div>
        {expanded ? (
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap font-mono">
            {pack.content}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  )
}
