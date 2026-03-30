import { createAccountantComment, getAccountantInviteByToken } from "@/models/accountants"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)
  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 })
  }

  let body: { inviteId?: string; entityType?: string; entityId?: string; body?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { entityType, entityId, body: text } = body
  if (!entityType || !entityId || !text?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  if (text.trim().length > 2000) {
    return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 })
  }

  const comment = await createAccountantComment(invite.id, entityType, entityId, text.trim())
  return NextResponse.json(comment)
}
