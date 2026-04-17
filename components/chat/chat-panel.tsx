import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Loader2, Send, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProposalCard } from "@/components/chat/proposal-card"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { hasAnyProviderConfigured } from "@/lib/llm-providers"
import { Link } from "@/lib/navigation"
import type { ProposedAction } from "@/lib/db-types"

type Props = {
  contextTransactionId?: string
  className?: string
}

export function ChatPanel({ contextTransactionId, className }: Props) {
  const t = useTranslations("chat")
  const confirm = useConfirm()
  const utils = trpc.useUtils()
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement | null>(null)

  const { data: settings } = trpc.settings.get.useQuery({})
  const providerConfigured = settings ? hasAnyProviderConfigured(settings) : true

  const { data: messages = [], isLoading } = trpc.chat.list.useQuery(undefined, {
    enabled: providerConfigured,
  })

  const send = trpc.chat.send.useMutation({
    onSuccess: () => {
      setInput("")
      void utils.chat.list.invalidate()
    },
  })

  const applyAction = trpc.chat.applyProposedAction.useMutation({
    onSuccess: () => {
      void utils.chat.list.invalidate()
      void utils.transactions.list.invalidate()
      void utils.transactions.getById.invalidate()
      void utils.rules.list.invalidate()
      void utils.categories.list.invalidate()
      void utils.projects.list.invalidate()
    },
  })
  const applyRule = trpc.chat.applyProposedRule.useMutation({
    onSuccess: () => void utils.chat.list.invalidate(),
  })
  const applyUpdate = trpc.chat.applyProposedUpdate.useMutation({
    onSuccess: () => {
      void utils.chat.list.invalidate()
      void utils.transactions.list.invalidate()
      void utils.transactions.getById.invalidate()
    },
  })
  const clear = trpc.chat.clear.useMutation({
    onSuccess: () => void utils.chat.list.invalidate(),
  })

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, send.isPending])

  if (!providerConfigured) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 p-6 text-center", className)}>
        <div className="text-sm font-medium">{t("noProviderTitle")}</div>
        <div className="text-xs text-muted-foreground max-w-xs">{t("noProviderBody")}</div>
        <Link href="/settings/llm" className="text-xs underline">{t("noProviderCta")}</Link>
      </div>
    )
  }

  const handleSend = () => {
    const content = input.trim()
    if (!content || send.isPending) return
    send.mutate({
      content,
      ...(contextTransactionId !== undefined ? { contextTransactionId } : {}),
    })
  }

  const handleClear = async () => {
    const ok = await confirm({
      title: t("clearConfirmTitle"),
      description: t("clearConfirmBody"),
      confirmLabel: t("clearHistory"),
      variant: "destructive",
    })
    if (ok) clear.mutate()
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <header className="flex items-center justify-between border-b px-3 py-2 pr-10">
        <span className="text-sm font-semibold">{t("title")}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          title={t("clearHistory")}
          disabled={clear.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="rounded bg-muted/60 p-2 text-xs text-muted-foreground">
                <div className="font-medium mb-1">Summary</div>
                <div>{m.content}</div>
              </div>
            )
          }
          const isUser = m.role === "user"
          const isError = m.status === "error"
          return (
            <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded px-3 py-2 text-sm whitespace-pre-wrap",
                  isUser ? "bg-primary text-primary-foreground" : "bg-muted",
                  isError && "border border-red-400 bg-red-50 text-red-800",
                )}
              >
                <div>{m.content}</div>
                {(() => {
                  const meta = m.metadata
                  let action: ProposedAction | null = null
                  if (meta?.proposedAction) action = meta.proposedAction
                  else if (meta?.proposedRule) {
                    const r = meta.proposedRule
                    action = {
                      kind: "createRule",
                      name: r.name,
                      matchType: r.matchType,
                      matchField: r.matchField,
                      matchValue: r.matchValue,
                      ...(r.categoryCode !== undefined ? { categoryCode: r.categoryCode } : {}),
                      ...(r.projectCode !== undefined ? { projectCode: r.projectCode } : {}),
                      ...(r.type !== undefined ? { type: r.type } : {}),
                      ...(r.priority !== undefined ? { priority: r.priority } : {}),
                      reason: r.reason,
                    }
                  } else if (meta?.proposedUpdate) {
                    const u = meta.proposedUpdate
                    action = {
                      kind: "updateTransaction",
                      transactionId: u.transactionId,
                      patch: u.patch,
                      reason: u.reason,
                    }
                  }
                  if (!action) return null
                  return (
                    <ProposalCard
                      action={action}
                      applied={Boolean(m.appliedAt)}
                      onApply={async () => {
                        if (meta?.proposedAction) {
                          await applyAction.mutateAsync({ messageId: m.id })
                        } else if (meta?.proposedRule) {
                          await applyRule.mutateAsync({ messageId: m.id })
                        } else if (meta?.proposedUpdate) {
                          await applyUpdate.mutateAsync({ messageId: m.id })
                        }
                      }}
                    />
                  )
                })()}
                {isError && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => {
                      const idx = messages.indexOf(m)
                      const prev = messages
                        .slice(0, idx)
                        .reverse()
                        .find((x) => x.role === "user")
                      if (prev) {
                        send.mutate({
                          content: prev.content,
                          ...(contextTransactionId !== undefined ? { contextTransactionId } : {}),
                        })
                      }
                    }}
                  >
                    {t("retry")}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
        {send.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            …
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={t("placeholder")}
            rows={2}
            className="flex-1 resize-none rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={send.isPending}
          />
          <Button onClick={handleSend} disabled={send.isPending || !input.trim()} size="icon">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
