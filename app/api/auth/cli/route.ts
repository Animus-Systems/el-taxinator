import { NextResponse } from "next/server"
import {
  getAllAuthStatus,
  getClaudeLoginUrl,
  completeClaudeLogin,
  logoutClaude,
  getCodexLoginUrl,
  completeCodexLogin,
  logoutCodex,
} from "@/lib/cli-auth"

// GET /api/auth/cli — Get auth status for all CLI providers
export async function GET() {
  try {
    const status = getAllAuthStatus()
    return NextResponse.json(status)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check auth status" },
      { status: 500 }
    )
  }
}

// POST /api/auth/cli — Perform auth actions
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, provider, code } = body as {
      action: string
      provider: string
      code?: string
    }

    if (action === "login") {
      if (provider === "claude") {
        const url = getClaudeLoginUrl()
        if (url) return NextResponse.json({ loginUrl: url })
        return NextResponse.json({ error: "Could not generate Claude login URL. Is Claude CLI installed?" }, { status: 500 })
      }
      if (provider === "codex") {
        const url = getCodexLoginUrl()
        if (url) return NextResponse.json({ loginUrl: url })
        return NextResponse.json({ error: "Could not generate Codex login URL. Is Codex CLI installed?" }, { status: 500 })
      }
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
    }

    if (action === "complete-login") {
      if (provider === "claude" && code) {
        const result = await completeClaudeLogin(code.trim())
        if (result.success) return NextResponse.json({ success: true, status: getAllAuthStatus() })
        return NextResponse.json({ success: false, error: result.error || "Login failed" }, { status: 400 })
      }
      if (provider === "codex" && code) {
        const result = await completeCodexLogin(code.trim())
        if (result.success) return NextResponse.json({ success: true, status: getAllAuthStatus() })
        return NextResponse.json({ success: false, error: result.error || "Login failed" }, { status: 400 })
      }
      return NextResponse.json({ error: "Provider and code required" }, { status: 400 })
    }

    if (action === "logout") {
      if (provider === "claude") {
        logoutClaude()
        return NextResponse.json({ success: true, status: getAllAuthStatus() })
      }
      if (provider === "codex") {
        logoutCodex()
        return NextResponse.json({ success: true, status: getAllAuthStatus() })
      }
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
    }

    if (action === "status") {
      return NextResponse.json(getAllAuthStatus())
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auth action failed" },
      { status: 500 }
    )
  }
}
