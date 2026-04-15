import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, RotateCw, AlertTriangle, Sparkles } from "lucide-react"
import type { BulkAction, WizardMessage } from "@/lib/db-types"

type Props = {
  sessionId: string
  messages: WizardMessage[]
  pendingTurnAt: Date | null
  onAfterTurn?: () => void
}

export function WizardChat({ sessionId, messages, pendingTurnAt, onAfterTurn }: Props) {
  const { t, i18n } = useTranslation("wizard")
  const utils = trpc.useUtils()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [lockConflict, setLockConflict] = useState(false)

  const sendTurn = trpc.wizard.sendTurn.useMutation({
    onSuccess: () => {
      setDraft("")
      setLocalError(null)
      setLockConflict(false)
      utils.wizard.get.invalidate({ sessionId })
      utils.wizard.listBusinessFacts.invalidate()
      onAfterTurn?.()
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        setLockConflict(true)
        return
      }
      setLocalError(err.message)
    },
  })

  const retryTurn = trpc.wizard.retryTurn.useMutation({
    onSuccess: () => {
      setLocalError(null)
      setLockConflict(false)
      utils.wizard.get.invalidate({ sessionId })
      onAfterTurn?.()
    },
    onError: (err) => {
      setLocalError(err.message)
    },
  })

  const stealLock = trpc.wizard.stealLock.useMutation({
    onSuccess: () => {
      setLockConflict(false)
      utils.wizard.get.invalidate({ sessionId })
    },
  })

  const applyBulk = trpc.wizard.applyBulkAction.useMutation({
    onSuccess: () => {
      utils.wizard.get.invalidate({ sessionId })
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, sendTurn.isPending])

  const isTurnPending = sendTurn.isPending || retryTurn.isPending
  const lastMessage = messages[messages.length - 1]
  const lastAssistantFailed = lastMessage?.role === "assistant" && lastMessage.status === "failed"

  const { data: llmHint } = trpc.settings.getActiveLLMHint.useQuery(
    {},
    { staleTime: 30_000 },
  )

  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  useEffect(() => {
    if (isTurnPending && turnStartedAt === null) {
      setTurnStartedAt(Date.now())
    } else if (!isTurnPending && turnStartedAt !== null) {
      setTurnStartedAt(null)
    }
  }, [isTurnPending, turnStartedAt])

  function onSend() {
    const text = draft.trim()
    if (!text) return
    sendTurn.mutate({ sessionId, userMessage: text, locale: i18n.language })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 p-1 min-w-0">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onApplyBulkAction={(action) =>
              applyBulk.mutate({ sessionId, action })
            }
          />
        ))}

        {pendingTurnAt && !isTurnPending ? (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="py-3 text-sm text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {t("resumePendingTurn")}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => retryTurn.mutate({ sessionId, locale: i18n.language })}
              >
                <RotateCw className="h-3.5 w-3.5 mr-1" />
                {t("retry")}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {lockConflict ? (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="py-3 text-sm text-amber-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {t("lockStale")}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => stealLock.mutate({ sessionId })}
              >
                {t("stealLock")}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {lastAssistantFailed && !isTurnPending ? (
          <Card className="border-red-300 bg-red-50/50">
            <CardContent className="py-3 text-sm text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {t("assistantFailure")}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => retryTurn.mutate({ sessionId, locale: i18n.language })}
              >
                <RotateCw className="h-3.5 w-3.5 mr-1" />
                {t("retry")}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isTurnPending && turnStartedAt !== null ? (
          <ThinkingIndicator
            startedAt={turnStartedAt}
            label={t("thinking")}
            eligible={llmHint?.eligible ?? []}
          />
        ) : null}

        {localError ? (
          <div className="text-sm text-destructive p-3">{localError}</div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="border-t pt-3 mt-3 flex gap-2 items-end">
        <Textarea
          placeholder={t("placeholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isTurnPending}
          rows={2}
          className="flex-1"
        />
        <Button onClick={onSend} disabled={!draft.trim() || isTurnPending}>
          {isTurnPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4 mr-1" />
              {t("send")}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

type LLMHintItem = {
  provider: string
  model: string
  thinking: string | null
  modelIsDefault: boolean
  isSubscription: boolean
}

function ThinkingIndicator({
  startedAt,
  label,
  eligible,
}: {
  startedAt: number
  label: string
  eligible: LLMHintItem[]
}) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000))
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [startedAt])

  // Effective per-call timeout matches ai/providers/llmProvider.ts:
  // 240s without attachments, 300s with. Wizard turns have no attachments.
  const timeoutSec = 240
  const remaining = Math.max(0, timeoutSec - elapsed)
  const overBudget = remaining === 0

  const primary = eligible[0]
  const fallbacks = eligible.slice(1)

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
        <span className="font-medium">{label}</span>
        <span
          className={[
            "ml-auto tabular-nums text-[11px]",
            overBudget ? "text-destructive" : "text-muted-foreground",
          ].join(" ")}
          title={`Per-call timeout ${timeoutSec}s`}
        >
          {elapsed}s {overBudget ? "" : `· ${remaining}s left`}
        </span>
      </div>
      {primary ? (
        <div className="mt-1 ml-[22px] text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5">
          <span>via</span>
          <span className="font-medium text-foreground/80">{primary.provider}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="font-mono">{primary.model}</span>
          {primary.modelIsDefault ? (
            <span className="text-muted-foreground/60">(default)</span>
          ) : null}
          {primary.thinking ? (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>thinking={primary.thinking}</span>
            </>
          ) : null}
          {primary.isSubscription ? (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>subscription CLI</span>
            </>
          ) : null}
        </div>
      ) : null}
      {fallbacks.length > 0 ? (
        <div className="mt-0.5 ml-[22px] text-[11px] text-muted-foreground/70">
          fallback: {fallbacks.map((f) => f.provider).join(" → ")}
        </div>
      ) : null}
    </div>
  )
}

function MessageBubble({
  message,
  onApplyBulkAction,
}: {
  message: WizardMessage
  onApplyBulkAction: (action: BulkAction) => void
}) {
  const { t } = useTranslation("wizard")

  const isUser = message.role === "user"
  const isSystem = message.role === "system"

  return (
    <div className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary text-primary-foreground"
            : isSystem
              ? "bg-muted text-muted-foreground italic"
              : "bg-muted",
          message.status === "failed" ? "border border-red-400" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div>{message.content}</div>

        {message.clarifyingQuestions && message.clarifyingQuestions.length > 0 ? (
          <div className="mt-2 text-xs">
            <div className="font-medium mb-1">{t("clarifyingQuestionsHeader")}</div>
            <ul className="list-disc ml-4 space-y-0.5">
              {message.clarifyingQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {message.bulkActions && message.bulkActions.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {message.bulkActions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant="outline"
                className="h-auto min-h-7 py-1.5 justify-start items-start text-left text-xs gap-1.5 whitespace-normal w-full"
                onClick={() => onApplyBulkAction(action)}
              >
                <Sparkles className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0 break-words">{action.description}</span>
                <Badge variant="secondary" className="ml-auto flex-shrink-0">
                  {action.affectedRowIndexes?.length ?? 0}
                </Badge>
              </Button>
            ))}
          </div>
        ) : null}

        {message.taxTips && message.taxTips.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {message.taxTips.map((tip, i) => (
              <div
                key={i}
                className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 mb-0.5">
                  <Sparkles className="h-3 w-3" />
                  <span className="font-medium">{tip.title}</span>
                </div>
                <div className="text-foreground">{tip.body}</div>
                <div className="text-[10px] italic text-muted-foreground mt-1">
                  {t("taxTipLegalBasis")}: {tip.legalBasis}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {message.candidateUpdates && message.candidateUpdates.length > 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Updated {message.candidateUpdates.length} row(s).
          </div>
        ) : null}
      </div>
    </div>
  )
}
