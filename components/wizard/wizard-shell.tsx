import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Archive, CheckCircle2, Loader2, PanelBottomClose, Trash2 } from "lucide-react"
import { WizardChat } from "./wizard-chat"
import { WizardCandidatePanel } from "./wizard-candidate-panel"
import type { TransactionCandidate } from "@/ai/import-csv"
import { validateImportCommit } from "@/lib/import-review"
import { useWizardDock } from "@/lib/wizard-dock-context"

type ViewMode = "split" | "chat" | "table"

type Props = {
  sessionId: string
}

export function WizardShell({ sessionId }: Props) {
  const { t } = useTranslation("wizard")
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const dock = useWizardDock()
  const [view, setView] = useState<ViewMode>("split")
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  function handleDock() {
    dock.setSession(sessionId)
    navigate({ to: "/transactions" as string })
  }

  const { data, isLoading, isFetching, error } = trpc.wizard.get.useQuery({ sessionId })

  const abandonMutation = trpc.wizard.abandonSession.useMutation({
    onSuccess: () => {
      utils.wizard.listResumable.invalidate()
      utils.wizard.listArchived.invalidate()
      window.location.assign("/wizard/new")
    },
  })

  const deleteMutation = trpc.wizard.deleteSession.useMutation({
    onSuccess: () => {
      utils.wizard.listResumable.invalidate()
      utils.wizard.listArchived.invalidate()
      window.location.assign("/wizard/new")
    },
  })

  // Show the spinner on initial load AND while React Query is still retrying
  // after a transient failure (e.g. the `yarn dev` startup race before Postgres
  // is ready). Only render the error state once retries are exhausted.
  if (isLoading || (isFetching && !data)) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 text-sm text-destructive">
        {error?.message ?? "Session not found"}
      </div>
    )
  }

  const candidates = (data.candidates as unknown[] as TransactionCandidate[]) ?? []
  const messages = data.messages ?? []

  const selectedRows = candidates.filter((c) => c.selected)
  const validation = validateImportCommit(selectedRows)
  const commitEligible = selectedRows.length > 0 && validation.ok

  async function handleCommit() {
    setCommitError(null)
    setCommitting(true)
    try {
      const resp = await fetch(`/api/import/session/${sessionId}/commit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedRowIndexes: selectedRows.map((c) => c.rowIndex),
          reviewedCandidates: candidates,
          acceptedCategories: [],
        }),
      })
      const json = (await resp.json()) as {
        success: boolean
        created?: number
        error?: string
        validationErrors?: unknown
      }
      if (!json.success) {
        throw new Error(json.error || "commit failed")
      }
      utils.wizard.listResumable.invalidate()
      utils.wizard.listArchived.invalidate()
      navigate({ to: `/wizard/${sessionId}/committed` as string })
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "commit failed")
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <header className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-border/40">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-tight">{t("title")}</h2>
          {data.session.title || data.session.entryMode ? (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {data.session.title ?? ""}
              {data.session.title && data.session.entryMode ? " · " : ""}
              {data.session.entryMode ?? ""}
            </p>
          ) : null}
        </div>

        <div className="inline-flex items-center rounded-lg bg-muted/60 p-0.5 text-[11px] flex-shrink-0">
          {(["split", "chat", "table"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={[
                "px-3 py-1 rounded-md transition-colors capitalize",
                view === mode
                  ? "bg-background shadow-sm text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t(`${mode}Tab`)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="default"
            size="sm"
            onClick={handleCommit}
            disabled={!commitEligible || committing}
            title={!commitEligible ? t("commitDisabledHint") : undefined}
            className="rounded-full px-4 h-8"
          >
            {committing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            {selectedRows.length > 0
              ? t("commitCount", { count: selectedRows.length })
              : t("commit")}
          </Button>
          <div className="w-px h-5 bg-border/60 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDock}
            disabled={committing}
            title={t("dockAndContinue")}
            className="h-8 w-8 p-0"
          >
            <PanelBottomClose className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(t("confirmAbandon"))) {
                abandonMutation.mutate({ sessionId })
              }
            }}
            disabled={abandonMutation.isPending || deleteMutation.isPending || committing}
            title={t("close")}
            className="h-8 w-8 p-0"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (window.confirm(t("confirmDelete"))) {
                deleteMutation.mutate({ sessionId })
              }
            }}
            disabled={abandonMutation.isPending || deleteMutation.isPending || committing}
            title={t("delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {commitError ? (
        <div className="mb-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {commitError}
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-h-0">
        {view === "split" ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-2 p-3 flex flex-col min-h-0">
              <WizardChat
                sessionId={sessionId}
                messages={messages}
                pendingTurnAt={data.pendingTurnAt}
              />
            </Card>
            <div className="lg:col-span-3 min-h-0 overflow-hidden">
              <WizardCandidatePanel candidates={candidates} />
            </div>
          </div>
        ) : null}

        {view === "chat" ? (
          <Card className="flex-1 p-3 flex flex-col min-h-0">
            <WizardChat
              sessionId={sessionId}
              messages={messages}
              pendingTurnAt={data.pendingTurnAt}
            />
          </Card>
        ) : null}

        {view === "table" ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <WizardCandidatePanel candidates={candidates} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
