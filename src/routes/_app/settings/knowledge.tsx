import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useRouterState } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, CheckCircle2, RotateCcw, BookOpen, AlertTriangle, ChevronRight } from "lucide-react"
import type { KnowledgePack } from "@/lib/db-types"
import { useConfirm } from "@/components/ui/confirm-dialog"

type ParsedRefreshError =
  | { kind: "typed"; code: string; providerName: string | null; modelName: string | null; message: string }
  | { kind: "plain"; message: string }

function parseRefreshError(raw: string): ParsedRefreshError {
  try {
    const obj = JSON.parse(raw) as { refreshError?: { code: string; providerName: string | null; modelName: string | null; message: string } }
    if (obj.refreshError) {
      return { kind: "typed", ...obj.refreshError }
    }
  } catch {
    // not JSON
  }
  return { kind: "plain", message: raw }
}

function renderRefreshError(
  err: ParsedRefreshError,
  t: (key: string, vars: Record<string, string>) => string,
): string {
  if (err.kind === "plain") return err.message
  const provider = err.providerName ?? "unknown"
  const model = err.modelName ?? "default"
  switch (err.code) {
    case "malformed_output":
      return t("refreshProviderMismatch", { provider, model })
    case "truncated":
      return t("refreshTruncated", { provider, model })
    case "no_providers":
      return err.message
    default:
      return `${provider}${err.modelName ? ` (${model})` : ""}: ${err.message}`
  }
}

export function KnowledgeSettingsPage() {
  const { t } = useTranslation("knowledge")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const { data: packs = [], isLoading } = trpc.knowledge.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const next = query.state.data ?? []
      return next.some((pack) => pack.refreshState === "queued" || pack.refreshState === "running")
        ? 2000
        : false
    },
  })
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)
  const [expandedContentSlug, setExpandedContentSlug] = useState<string | null>(null)
  const [expandedPendingSlug, setExpandedPendingSlug] = useState<string | null>(null)

  const querySlug = useRouterState({
    select: (s) => {
      const search = s.location.search as Record<string, unknown>
      const v = search["slug"]
      return typeof v === "string" ? v : null
    },
  })
  useEffect(() => {
    if (querySlug) setExpandedSlug(querySlug)
  }, [querySlug])
  const [refreshError, setRefreshError] = useState<ParsedRefreshError | null>(null)

  const refresh = trpc.knowledge.refresh.useMutation({
    onMutate: () => {
      setRefreshError(null)
    },
    onSuccess: async () => {
      await Promise.all([
        utils.knowledge.list.invalidate(),
        utils.knowledge.hasStale.invalidate(),
      ])
    },
    onError: (err) => {
      setRefreshError(parseRefreshError(err.message))
    },
  })

  const markVerified = trpc.knowledge.markVerified.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.knowledge.list.invalidate(),
        utils.knowledge.hasStale.invalidate(),
      ])
    },
  })

  const resetToSeed = trpc.knowledge.resetToSeed.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.knowledge.list.invalidate(),
        utils.knowledge.hasStale.invalidate(),
      ])
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const now = Date.now()
  const isRefreshing = (pack: KnowledgePack): boolean =>
    pack.refreshState === "queued" || pack.refreshState === "running"
  const isStale = (pack: KnowledgePack): boolean => {
    if (isRefreshing(pack)) return false
    if (!pack.lastRefreshedAt) return true
    const days = (now - new Date(pack.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days >= pack.refreshIntervalDays
  }

  const [bulkRunning, setBulkRunning] = useState<null | "stale" | "all">(null)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const PER_PACK_TIMEOUT_MS = 5 * 60 * 1000
  const POLL_INTERVAL_MS = 2000

  const waitForIdle = async (slug: string): Promise<void> => {
    const start = Date.now()
    while (Date.now() - start < PER_PACK_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const fresh = await utils.knowledge.list.fetch(undefined)
      const p = fresh.find((x) => x.slug === slug)
      if (!p) return
      if (p.refreshState !== "queued" && p.refreshState !== "running") return
    }
  }

  const refreshMany = async (which: "stale" | "all"): Promise<void> => {
    const targets = packs.filter((p) => !isRefreshing(p) && (which === "all" || isStale(p)))
    if (targets.length === 0) return
    setBulkRunning(which)
    setBulkProgress({ done: 0, total: targets.length })
    setRefreshError(null)
    let done = 0
    for (const p of targets) {
      try {
        await refresh.mutateAsync({ slug: p.slug })
        await waitForIdle(p.slug)
      } catch {
        // individual failures surface via refresh.onError / refreshMessage per pack
      }
      done += 1
      setBulkProgress({ done, total: targets.length })
    }
    setBulkRunning(null)
    setBulkProgress(null)
  }

  const staleCount = packs.filter((p) => isStale(p)).length
  const anyRefreshing = packs.some((p) => isRefreshing(p))

  return (
    <div className="space-y-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Curated knowledge the AI accountant consults during wizard sessions. Refresh each pack
            periodically so tax rates and deadlines stay current. Refresh now runs in the background
            and this page will update while the provider is working.
          </p>
        </div>
        {packs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void refreshMany("stale") }}
              disabled={bulkRunning !== null || staleCount === 0 || anyRefreshing}
            >
              {bulkRunning === "stale" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {bulkRunning === "stale" && bulkProgress
                ? `Refreshing ${bulkProgress.done + 1} / ${bulkProgress.total}`
                : `Refresh stale${staleCount > 0 ? ` (${staleCount})` : ""}`}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { void refreshMany("all") }}
              disabled={bulkRunning !== null || anyRefreshing}
            >
              {bulkRunning === "all" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {bulkRunning === "all" && bulkProgress
                ? `Refreshing ${bulkProgress.done + 1} / ${bulkProgress.total}`
                : "Force refresh all"}
            </Button>
          </div>
        ) : null}
      </header>

      {refreshError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{renderRefreshError(refreshError, (k, v) => t(k, v) as unknown as string)}</span>
        </div>
      ) : null}

      {packs.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No knowledge packs yet. They'll appear here on next page load.
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-md border bg-background">
          {packs.map((p: KnowledgePack) => (
            <PackRow
              key={p.slug}
              pack={p}
              expanded={expandedSlug === p.slug}
              contentExpanded={expandedContentSlug === p.slug}
              pendingExpanded={expandedPendingSlug === p.slug}
              onToggle={() => setExpandedSlug((s) => (s === p.slug ? null : p.slug))}
              onToggleContent={() => setExpandedContentSlug((s) => (s === p.slug ? null : p.slug))}
              onTogglePending={() =>
                setExpandedPendingSlug((s) => (s === p.slug ? null : p.slug))
              }
              onRefresh={() => refresh.mutate({ slug: p.slug })}
              onMarkVerified={() => markVerified.mutate({ slug: p.slug })}
              onResetSeed={async () => {
                const ok = await confirm({
                  title: "Reset knowledge pack?",
                  description: "Reset this pack to the shipped seed content?",
                  confirmLabel: "Reset",
                  variant: "destructive",
                })
                if (ok) resetToSeed.mutate({ slug: p.slug })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PackRow({
  pack,
  expanded,
  contentExpanded,
  pendingExpanded,
  onToggle,
  onToggleContent,
  onTogglePending,
  onRefresh,
  onMarkVerified,
  onResetSeed,
}: {
  pack: KnowledgePack
  expanded: boolean
  contentExpanded: boolean
  pendingExpanded: boolean
  onToggle: () => void
  onToggleContent: () => void
  onTogglePending: () => void
  onRefresh: () => void
  onMarkVerified: () => void
  onResetSeed: () => void
}) {
  const { t } = useTranslation("knowledge")
  const days = pack.lastRefreshedAt
    ? Math.floor((Date.now() - new Date(pack.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const stale = days === null || days >= pack.refreshIntervalDays
  const isRefreshing = pack.refreshState === "queued" || pack.refreshState === "running"

  const statusBadge = (() => {
    if (pack.reviewStatus === "seed") return <Badge variant="outline" className="text-[10px]">{t("seedBadge")}</Badge>
    if (pack.reviewStatus === "needs_review") {
      return <Badge variant="secondary" className="text-[10px]">{t("needsReviewBadge")}</Badge>
    }
    if (pack.reviewStatus === "verified") {
      return <Badge variant="default" className="text-[10px]">{t("verifiedBadge")}</Badge>
    }
    return <Badge variant="outline" className="text-[10px]">{pack.reviewStatus}</Badge>
  })()

  const refreshBadge = (() => {
    if (pack.refreshState === "queued") return <Badge variant="secondary" className="text-[10px]">{t("refreshQueued")}</Badge>
    if (pack.refreshState === "running") return <Badge variant="secondary" className="text-[10px]">{t("refreshRunning")}</Badge>
    if (pack.refreshState === "failed") return <Badge variant="destructive" className="text-[10px]">{t("refreshFailed")}</Badge>
    return null
  })()

  const refreshedVia = pack.lastRefreshedAt && pack.provider
    ? t("refreshedVia", {
        ago: days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`,
        provider: pack.provider,
        model: pack.model ?? "",
      })
    : null

  const refreshDetailTone =
    pack.refreshState === "failed"
      ? "text-destructive"
      : pack.refreshState === "queued" || pack.refreshState === "running"
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground"

  return (
    <div className="group">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        aria-expanded={expanded}
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="text-sm font-medium truncate">{pack.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          {statusBadge}
          {refreshBadge}
          {stale ? <Badge variant="destructive" className="text-[10px]">{t("staleBadge")}</Badge> : null}
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground shrink-0 tabular-nums">
          {days !== null ? `${days}d ago` : "—"}
        </span>
      </button>

      {expanded ? (
        <div className="border-t bg-muted/20 px-3 py-3 space-y-3">
          <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
            <span>slug: <code className="text-[11px]">{pack.slug}</code></span>
            <span>
              {t("lastRefreshed")}:{" "}
              {pack.lastRefreshedAt ? new Date(pack.lastRefreshedAt).toLocaleDateString() : "—"}
            </span>
            {refreshedVia ? <span>{refreshedVia}</span> : null}
          </div>

          {pack.refreshMessage ? (
            <div className={`text-xs ${refreshDetailTone}`}>{pack.refreshMessage}</div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              {pack.refreshState === "running"
                ? t("refreshRunning")
                : pack.refreshState === "queued"
                  ? t("refreshQueued")
                  : t("refreshNow")}
            </Button>
            {pack.reviewStatus === "needs_review" ? (
              <Button variant="default" size="sm" onClick={onMarkVerified}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {t("markVerified")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onResetSeed}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {t("resetSeed")}
            </Button>
            <Button variant="secondary" size="sm" onClick={onToggleContent}>
              {contentExpanded ? "Hide content" : "Show content"}
            </Button>
            {pack.pendingReviewContent ? (
              <Button variant="secondary" size="sm" onClick={onTogglePending}>
                {pendingExpanded ? "Hide previous version" : t("previousUnreviewedVersion")}
              </Button>
            ) : null}
          </div>

          {contentExpanded ? (
            <pre className="max-h-[500px] overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
              {pack.content}
            </pre>
          ) : null}

          {pendingExpanded && pack.pendingReviewContent ? (
            <pre className="max-h-[360px] overflow-auto rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs whitespace-pre-wrap">
              {pack.pendingReviewContent}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
