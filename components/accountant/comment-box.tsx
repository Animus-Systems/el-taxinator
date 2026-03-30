"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, Send } from "lucide-react"

type Comment = {
  id: string
  body: string
  createdAt: Date
}

async function submitComment(inviteId: string, entityType: string, entityId: string, token: string, body: string) {
  const res = await fetch(`/api/accountant/${token}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteId, entityType, entityId, body }),
  })
  if (!res.ok) throw new Error("Failed to submit comment")
  return res.json()
}

export function AccountantCommentBox({
  inviteId,
  entityType,
  entityId,
  token,
  initialComments = [],
}: {
  inviteId: string
  entityType: string
  entityId: string
  token: string
  initialComments?: Comment[]
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!body.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const comment = await submitComment(inviteId, entityType, entityId, token, body.trim())
        setComments((prev) => [...prev, comment])
        setBody("")
      } catch {
        setError("Failed to submit comment. Please try again.")
      }
    })
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">Accountant Notes</h3>
      </div>

      {comments.length > 0 && (
        <div className="space-y-3 mb-4">
          {comments.map((c) => (
            <div key={c.id} className="bg-muted/50 rounded p-3 text-sm">
              <p className="whitespace-pre-wrap">{c.body}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note or annotation for the owner…"
          className="min-h-[80px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit()
            }
          }}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={isPending || !body.trim()}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter to submit</p>
    </div>
  )
}
