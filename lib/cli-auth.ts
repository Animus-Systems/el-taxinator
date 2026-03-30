import { readFileSync, existsSync } from "fs"
import { execFileSync, spawn } from "child_process"
import { join } from "path"

const HOME = process.env.HOME || "/home/taxuser"

// ── Claude CLI Auth ──────────────────────────────────────────

interface ClaudeAuthStatus {
  provider: "claude"
  loggedIn: boolean
  email?: string
  displayName?: string
  accountUuid?: string
  organizationName?: string
}

export function getClaudeAuthStatus(): ClaudeAuthStatus {
  // Check .claude.json for oauthAccount
  try {
    const claudeJsonPath = join(HOME, ".claude.json")
    if (existsSync(claudeJsonPath)) {
      const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"))
      if (data.oauthAccount?.emailAddress) {
        return {
          provider: "claude",
          loggedIn: true,
          email: data.oauthAccount.emailAddress,
          displayName: data.oauthAccount.displayName,
          accountUuid: data.oauthAccount.accountUuid,
          organizationName: data.oauthAccount.organizationName,
        }
      }
    }
  } catch {}

  // Try CLI status
  try {
    const result = execFileSync("claude", ["auth", "status"], {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, HOME },
    }).trim()

    if (result.includes("Logged in") || result.includes("authenticated")) {
      return { provider: "claude", loggedIn: true }
    }
  } catch {}

  return { provider: "claude", loggedIn: false }
}

/**
 * Initiates Claude auth login. Returns the OAuth URL the user needs to visit.
 * After visiting, the user gets a code from platform.claude.com which they
 * paste back to complete the flow.
 */
export function getClaudeLoginUrl(): string | null {
  try {
    // Run with BROWSER=echo so it doesn't try to open a browser
    // The command outputs the URL and then waits for auth completion
    // We use timeout to kill it after extracting the URL
    const result = execFileSync("timeout", ["5", "claude", "auth", "login"], {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, HOME, BROWSER: "echo" },
    })
    return extractUrl(result)
  } catch (err: any) {
    // timeout kills the process with non-zero exit, but we still got stdout
    const combined = (err.stdout?.toString() || "") + (err.stderr?.toString() || "")
    return extractUrl(combined)
  }
}

/**
 * Completes Claude auth by feeding the auth code to the CLI.
 * The code is what the user gets from platform.claude.com after authenticating.
 */
export async function completeClaudeLogin(code: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["auth", "login"], {
      env: { ...process.env, HOME, BROWSER: "echo" },
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    proc.stdout?.on("data", (data) => { stdout += data.toString() })
    proc.stderr?.on("data", (data) => { stderr += data.toString() })

    // Wait for the URL output, then send the code
    const checkAndSend = setInterval(() => {
      if (stdout.includes("claude.com") || stdout.includes("oauth")) {
        clearInterval(checkAndSend)
        // Small delay to ensure CLI is ready for input
        setTimeout(() => {
          proc.stdin?.write(code + "\n")
          proc.stdin?.end()
        }, 500)
      }
    }, 200)

    const timeout = setTimeout(() => {
      clearInterval(checkAndSend)
      proc.kill()
      resolve({ success: false, error: "Login timed out" })
    }, 30000)

    proc.on("close", (exitCode) => {
      clearTimeout(timeout)
      clearInterval(checkAndSend)

      if (exitCode === 0 || stdout.includes("success") || stdout.includes("logged in")) {
        resolve({ success: true })
      } else {
        resolve({
          success: false,
          error: stderr || stdout || `CLI exited with code ${exitCode}`,
        })
      }
    })
  })
}

export function logoutClaude(): boolean {
  try {
    execFileSync("claude", ["auth", "logout"], {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, HOME },
    })
    return true
  } catch {
    return false
  }
}

// ── Codex CLI Auth ───────────────────────────────────────────

interface CodexAuthStatus {
  provider: "codex"
  loggedIn: boolean
  email?: string
  authMode?: string
}

export function getCodexAuthStatus(): CodexAuthStatus {
  try {
    const authPath = join(HOME, ".codex", "auth.json")
    if (!existsSync(authPath)) {
      return { provider: "codex", loggedIn: false }
    }

    const data = JSON.parse(readFileSync(authPath, "utf-8"))
    if (data.tokens?.id_token) {
      // Decode JWT to get email
      const payload = data.tokens.id_token.split(".")[1]
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString())
      return {
        provider: "codex",
        loggedIn: true,
        email: decoded.email,
        authMode: data.auth_mode || "chatgpt",
      }
    }

    if (data.OPENAI_API_KEY) {
      return {
        provider: "codex",
        loggedIn: true,
        authMode: "api_key",
      }
    }
  } catch {}

  return { provider: "codex", loggedIn: false }
}

// ── Combined Status ──────────────────────────────────────────

export interface AllAuthStatus {
  claude: ClaudeAuthStatus
  codex: CodexAuthStatus
}

export function getAllAuthStatus(): AllAuthStatus {
  return {
    claude: getClaudeAuthStatus(),
    codex: getCodexAuthStatus(),
  }
}

// ── Helpers ──────────────────────────────────────────────────

function extractUrl(text: string): string | null {
  const match = text.match(/https:\/\/claude\.com\/[^\s]+/)
  if (match) return match[0]
  const match2 = text.match(/https:\/\/[^\s]*oauth[^\s]*authorize[^\s]*/)
  if (match2) return match2[0]
  return null
}
