import { useTranslation } from "react-i18next"
import { Link, useRouterState } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Maximize2, Minus, Sparkles, X } from "lucide-react"
import { WizardChat } from "./wizard-chat"
import { useWizardDock } from "@/lib/wizard-dock-context"
import type { WizardMessage } from "@/lib/db-types"

/**
 * Floating chat panel anchored to the bottom-right of the app. Persists a
 * selected wizard session across route changes so the user can keep talking
 * to the AI accountant while navigating Transactions / Settings / Tax.
 *
 * Rendered inside the authenticated app layout. Hides itself automatically
 * when the user is already on the full `/wizard/:id` screen so the chat
 * doesn't appear twice.
 */
export function WizardDock() {
  const { t } = useTranslation("wizard")
  const dock = useWizardDock()

  // Don't double-render on the full wizard view or its committed screen.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onWizardRoute =
    /^\/wizard(\/[^/]+)?\/?$/.test(pathname) ||
    /^\/wizard\/[^/]+\/committed\/?$/.test(pathname)

  if (!dock.sessionId || onWizardRoute) return null

  return <DockBody sessionId={dock.sessionId} minimized={dock.minimized} t={t} />
}

function DockBody({
  sessionId,
  minimized,
  t,
}: {
  sessionId: string
  minimized: boolean
  t: (k: string) => string
}) {
  const dock = useWizardDock()
  const { data, isLoading, isFetching, error } = trpc.wizard.get.useQuery({ sessionId })

  const title =
    data?.session.title ?? data?.session.fileName ?? `Session ${sessionId.slice(0, 8)}`
  const messages: WizardMessage[] = data?.messages ?? []
  const unresolvedCount = ((data?.candidates as Array<{ status?: string }> | undefined) ?? [])
    .filter((c) => !c?.status || c.status === "needs_review").length

  const showError = !!error && !isFetching && !data

  // Minimized chip — small floating button with the session title
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={dock.restore}
          className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-shadow px-4 py-2 text-sm font-medium"
        >
          <Sparkles className="h-4 w-4" />
          <span className="max-w-[180px] truncate">{title}</span>
          {unresolvedCount > 0 ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
              {unresolvedCount}
            </Badge>
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))] h-[min(600px,calc(100vh-6rem))] flex flex-col rounded-lg border border-border bg-card shadow-2xl"
      role="dialog"
      aria-label={t("title")}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 rounded-t-lg">
        <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{title}</div>
          {unresolvedCount > 0 ? (
            <div className="text-[11px] text-muted-foreground">
              {unresolvedCount} {t("unresolvedCountLabel")}
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" asChild title={t("dockExpand")}>
          <Link to={`/wizard/${sessionId}` as string}>
            <Maximize2 className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={dock.minimize}
          title={t("dockMinimize")}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={dock.close} title={t("dockClose")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0 p-3">
        {isLoading || (isFetching && !data) ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : showError ? (
          <div className="flex-1 flex items-center justify-center text-sm text-destructive px-4 text-center">
            {error?.message ?? "Session not found"}
          </div>
        ) : (
          <WizardChat
            sessionId={sessionId}
            messages={messages}
            pendingTurnAt={data?.pendingTurnAt ?? null}
          />
        )}
      </div>
    </div>
  )
}
