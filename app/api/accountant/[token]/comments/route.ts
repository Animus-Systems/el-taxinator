import { accountantCommentSchema } from "@/forms/accountant"
import { createAccountantComment, getAccountantInviteByToken } from "@/models/accountants"
import { sanitizeValidationError } from "@/lib/error-sanitizer"
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

  const parsed = accountantCommentSchema.safeParse(body)
  if (!parsed.success) {
    // Sanitize validation errors to prevent internal details leakage
    const safeError = sanitizeValidationError(parsed.error)
    return NextResponse.json({ error: safeError }, { status: 400 })
  }

  try {
    const comment = await createAccountantComment(
      invite.id,
      parsed.data.entityType,
      parsed.data.entityId,
      parsed.data.body
    )
    return NextResponse.json(comment)
  } catch (error) {
    console.error("Error creating accountant comment:", error)
    return NextResponse.json(
      { error: "Failed to create comment. Please try again." },
      { status: 500 }
    )
  }
}
