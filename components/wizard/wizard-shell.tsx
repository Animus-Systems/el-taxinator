import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { useNavigate } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Archive, CheckCircle2, Loader2, Paperclip, PanelBottomClose, Trash2, X } from "lucide-react"
import { WizardChat } from "./wizard-chat"
import { WizardCandidatePanel } from "./wizard-candidate-panel"
import type { TransactionCandidate } from "@/ai/import-csv"
import { validateImportCommit } from "@/lib/import-review"
import { useWizardDock } from "@/lib/wizard-dock-context"

type FileUploadResponse = {
  success: boolean
  error?: string
  files?: Array<{ id: string; filename: string }>
}

async function uploadContextFile(file: File): Promise<string> {
  const form = new FormData()
  form.append("files", file)
  const resp = await fetch("/api/files/upload", {
    method: "POST",
    body: form,
    credentials: "include",
  })
  if (!resp.ok) {
    throw new Error(`upload failed (${resp.status})`)
  }
  const json = (await resp.json()) as FileUploadResponse
  const created = json.files?.[0]
  if (!json.success || !created) {
    throw new Error(json.error ?? "upload failed")
  }
  return created.id
}

type ViewMode = "split" | "chat" | "table"

type Props = {
  sessionId: string
}

export function WizardShell({ sessionId }: Props) {
  const { t } = useTranslation("wizard")
  const confirm = useConfirm()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const dock = useWizardDock()
  const [view, setView] = useState<ViewMode>("split")
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [attachingCount, setAttachingCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const addContextFile = trpc.wizard.addContextFile.useMutation({
    onSuccess: () => utils.wizard.get.invalidate({ sessionId }),
  })
  const removeContextFile = trpc.wizard.removeContextFile.useMutation({
    onSuccess: () => utils.wizard.get.invalidate({ sessionId }),
  })
  // Auto-turn kicked off after a successful context-file attach: the AI reads
  // the new material and reclassifies proactively, instead of waiting for the
  // user to send another message manually.
  const sendTurn = trpc.wizard.sendTurn.useMutation({
    onSuccess: () => utils.wizard.get.invalidate({ sessionId }),
    onError: () => {
      toast.error(t("contextFiles.analyzeFailed"))
    },
  })

  const handleRemoveContext = (fileId: string) => {
    removeContextFile.mutate({ sessionId, fileId })
  }

  function handleDock() {
    dock.setSession(sessionId)
    navigate({ to: "/transactions" as string })
  }

  const { data, isLoading, isFetching, error } = trpc.wizard.get.useQuery({ sessionId })

  const handleAttachContextFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (fileList.length === 0) return
    setAttachingCount(fileList.length)
    const attachedNames: string[] = []
    try {
      for (const file of fileList) {
        try {
          const fileId = await uploadContextFile(file)
          await addContextFile.mutateAsync({ sessionId, fileId })
          attachedNames.push(file.name)
        } catch (err) {
          console.warn("Failed to attach context file:", file.name, err)
          toast.error(t("contextFiles.attachFailed", { name: file.name }))
        }
      }
    } finally {
      setAttachingCount(0)
    }

    // After every attachment in the batch has been processed, fire ONE
    // wizard turn so the AI ingests the new material and acts on it. If every
    // attach failed we skip the turn — nothing new to analyze.
    //
    // Force ALL candidates into the focus window regardless of status — when a
    // user attaches context specifically to re-evaluate the session, the AI
    // needs to see every row, not just `needs_review` ones (otherwise already-
    // classified rows get elided and the AI reports "no candidate rows loaded").
    if (attachedNames.length > 0) {
      const firstName = attachedNames[0]
      const userMessage =
        attachedNames.length === 1 && firstName !== undefined
          ? t("contextFiles.autoAnalyzeOne", { name: firstName })
          : t("contextFiles.autoAnalyzeMany", { names: attachedNames.join(", ") })
      const candidates = (data?.candidates ?? []) as Array<{ rowIndex?: number }>
      const focusRowIndexes = candidates
        .map((c) => c.rowIndex)
        .filter((i): i is number => typeof i === "number")
      sendTurn.mutate({
        sessionId,
        userMessage,
        ...(focusRowIndexes.length > 0 ? { focusRowIndexes } : {}),
      })
    }
  }

  // Auto-kick the first categorization turn when the session has ONLY the
  // seeded opening message and no prior user input. Classifies eagerly instead
  // of waiting for the user to say "go". Once-per-session via a ref so React
  // strict-mode + refetches don't fire it twice.
  const autoKickedRef = useRef(false)
  useEffect(() => {
    if (autoKickedRef.current) return
    if (!data) return
    if (data.messages.length !== 1) return
    const only = data.messages[0]
    if (!only || only.role !== "assistant") return
    const candidates = (data.candidates ?? []) as Array<{ rowIndex?: number; status?: string }>
    const hasReviewable = candidates.some(
      (c) => !c.status || c.status === "needs_review",
    )
    if (!hasReviewable) return
    if (sendTurn.isPending) return
    autoKickedRef.current = true
    const focusRowIndexes = candidates
      .map((c) => c.rowIndex)
      .filter((i): i is number => typeof i === "number")
    sendTurn.mutate({
      sessionId,
      userMessage:
        "Please classify all rows now. Propose rules when you spot patterns, " +
        "surface any crypto rows that need cost basis, and flag anything " +
        "ambiguous with a specific question rather than guessing.",
      ...(focusRowIndexes.length > 0 ? { focusRowIndexes } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.messages.length, sessionId])

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
  const contextFiles = data.contextFiles ?? []

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
        deferredSessionId?: string | null
        deferredCount?: number
        rowErrors?: Array<{ rowIndex: number; message: string }>
      }
      if (!json.success) {
        throw new Error(json.error || "commit failed")
      }
      utils.wizard.listResumable.invalidate()
      utils.wizard.listArchived.invalidate()

      // Surface partial per-row failures: the request succeeded overall but some
      // rows couldn't be inserted (e.g. FK violation on a missing category).
      // Toast a warning and log the offending rows so the user can correct them.
      if (json.rowErrors && json.rowErrors.length > 0) {
        const firstErr = json.rowErrors[0]
        const firstMsg = firstErr ? firstErr.message : "unknown error"
        const createdCount = json.created ?? 0
        const totalAttempted = createdCount + json.rowErrors.length
        console.error("[wizard/commit] per-row failures:", json.rowErrors)
        toast.warning(
          `Committed ${createdCount} of ${totalAttempted} rows. ` +
            `${json.rowErrors.length} failed. First error: ${firstMsg}`,
          { duration: 10_000 },
        )
      }

      const deferredId = json.deferredSessionId
      const deferredN = json.deferredCount ?? 0
      if (deferredId && deferredN > 0) {
        const message =
          deferredN === 1
            ? t("commitWithDeferredOne")
            : t("commitWithDeferredMany", { count: deferredN })
        toast.success(message, {
          action: {
            label: t("openDeferredSession"),
            onClick: () => navigate({ to: `/wizard/${deferredId}` as string }),
          },
        })
      }

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
            onClick={async () => {
              const ok = await confirm({
                title: t("confirmAbandonTitle"),
                description: t("confirmAbandon"),
                confirmLabel: t("close"),
              })
              if (ok) abandonMutation.mutate({ sessionId })
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
            onClick={async () => {
              const ok = await confirm({
                title: t("confirmDeleteTitle"),
                description: t("confirmDelete"),
                confirmLabel: t("delete"),
                variant: "destructive",
              })
              if (ok) deleteMutation.mutate({ sessionId })
            }}
            disabled={abandonMutation.isPending || deleteMutation.isPending || committing}
            title={t("delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 mb-3 -mt-2">
        {contextFiles.map((f) => (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            <Paperclip className="h-3 w-3" />
            <span className="truncate max-w-[140px]" title={f.fileName}>
              {f.fileName}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveContext(f.id)}
              className="rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              aria-label={t("contextFiles.remove")}
              disabled={removeContextFile.isPending}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachingCount > 0}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-40"
        >
          {attachingCount > 0 ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          {attachingCount > 0
            ? t("contextFiles.attaching", { count: attachingCount })
            : t("contextFiles.attach")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,.pdf,.txt,.md,.docx,.doc"
          className="hidden"
          onChange={handleAttachContextFiles}
        />
        {sendTurn.isPending ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("contextFiles.analyzing")}
          </span>
        ) : null}
      </div>

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
                externalTurnPending={sendTurn.isPending}
              />
            </Card>
            <div className="lg:col-span-3 min-h-0 overflow-hidden flex flex-col">
              <WizardCandidatePanel sessionId={sessionId} candidates={candidates} />
            </div>
          </div>
        ) : null}

        {view === "chat" ? (
          <Card className="flex-1 p-3 flex flex-col min-h-0">
            <WizardChat
              sessionId={sessionId}
              messages={messages}
              pendingTurnAt={data.pendingTurnAt}
              externalTurnPending={sendTurn.isPending}
            />
          </Card>
        ) : null}

        {view === "table" ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <WizardCandidatePanel sessionId={sessionId} candidates={candidates} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
