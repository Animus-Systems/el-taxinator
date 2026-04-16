import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, CheckCircle2, RotateCcw, BookOpen, AlertTriangle } from "lucide-react"
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
  const [expandedPendingSlug, setExpandedPendingSlug] = useState<string | null>(null)
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

  return (
    <div className="space-y-6 py-4">
      <header>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Curated knowledge the AI accountant consults during wizard sessions. Refresh each pack
          periodically so tax rates and deadlines stay current. Refresh now runs in the background
          and this page will update while the provider is working.
        </p>
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
        <div className="space-y-3">
          {packs.map((p: KnowledgePack) => (
            <PackCard
              key={p.slug}
              pack={p}
              expanded={expandedSlug === p.slug}
              pendingExpanded={expandedPendingSlug === p.slug}
              onToggle={() => setExpandedSlug((s) => (s === p.slug ? null : p.slug))}
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

function PackCard({
  pack,
  expanded,
  pendingExpanded,
  onToggle,
  onTogglePending,
  onRefresh,
  onMarkVerified,
  onResetSeed,
}: {
  pack: KnowledgePack
  expanded: boolean
  pendingExpanded: boolean
  onToggle: () => void
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
    if (pack.reviewStatus === "seed") return <Badge variant="outline">{t("seedBadge")}</Badge>
    if (pack.reviewStatus === "needs_review") {
      return <Badge variant="secondary">{t("needsReviewBadge")}</Badge>
    }
    if (pack.reviewStatus === "verified") {
      return <Badge variant="default">{t("verifiedBadge")}</Badge>
    }
    return <Badge variant="outline">{pack.reviewStatus}</Badge>
  })()

  const refreshBadge = (() => {
    if (pack.refreshState === "queued") return <Badge variant="secondary">{t("refreshQueued")}</Badge>
    if (pack.refreshState === "running") return <Badge variant="secondary">{t("refreshRunning")}</Badge>
    if (pack.refreshState === "failed") return <Badge variant="destructive">{t("refreshFailed")}</Badge>
    if (pack.refreshState === "succeeded") return <Badge variant="outline">{t("refreshSucceeded")}</Badge>
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
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{pack.title}</h3>
              {statusBadge}
              {refreshBadge}
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
              {refreshedVia ? <span>{refreshedVia}</span> : null}
            </div>
            {pack.refreshMessage ? (
              <div className={`mt-2 text-xs ${refreshDetailTone}`}>
                {pack.refreshMessage}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onToggle}>
            {expanded ? "Hide content" : "Show content"}
          </Button>
          {pack.pendingReviewContent ? (
            <Button variant="secondary" size="sm" onClick={onTogglePending}>
              {pendingExpanded ? "Hide previous version" : t("previousUnreviewedVersion")}
            </Button>
          ) : null}
        </div>

        {expanded ? (
          <pre className="mt-3 max-h-[500px] overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
            {pack.content}
          </pre>
        ) : null}

        {pendingExpanded && pack.pendingReviewContent ? (
          <pre className="mt-3 max-h-[360px] overflow-auto rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs whitespace-pre-wrap">
            {pack.pendingReviewContent}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  )
}
