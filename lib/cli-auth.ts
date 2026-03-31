import { readFileSync, existsSync, unlinkSync } from "fs"
import { execFileSync, spawn } from "child_process"
import { join } from "path"

const HOME = process.env.HOME || "/home/taxuser"
const CLI_ENV = { ...process.env, HOME }
const CLI_ENV_NO_BROWSER = { ...CLI_ENV, BROWSER: "echo" }

// ── Generic CLI helpers ──────────────────────────────────────

function getCliLoginUrl(binary: string): string | null {
  try {
    execFileSync("timeout", ["5", binary, "auth", "login"], {
      encoding: "utf-8",
      timeout: 10000,
      env: CLI_ENV_NO_BROWSER,
    })
    return null
  } catch (err: unknown) {
    const e = err as { stdout?: { toString(): string }; stderr?: { toString(): string } }
    const combined = (e.stdout?.toString() || "") + (e.stderr?.toString() || "")
    return extractUrl(combined)
  }
}

function completeCliLogin(
  binary: string,
  code: string,
  readyPatterns: string[]
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(binary, ["auth", "login"], {
      env: CLI_ENV_NO_BROWSER,
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString() })
    proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString() })

    const checkAndSend = setInterval(() => {
      if (readyPatterns.some((p) => stdout.includes(p))) {
        clearInterval(checkAndSend)
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
        resolve({ success: false, error: stderr || stdout || `CLI exited with code ${exitCode}` })
      }
    })
  })
}

function logoutCli(binary: string): boolean {
  try {
    execFileSync(binary, ["auth", "logout"], {
      encoding: "utf-8",
      timeout: 10000,
      env: CLI_ENV,
    })
    return true
  } catch {
    return false
  }
}

function extractUrl(text: string): string | null {
  const match = text.match(/https:\/\/[^\s]+(?:oauth|authorize|auth|login)[^\s]*/)
  if (match) return match[0]
  const fallback = text.match(/https:\/\/(?:claude\.com|auth\.openai\.com|platform\.openai\.com)[^\s]+/)
  if (fallback) return fallback[0]
  return null
}

// ── Claude ───────────────────────────────────────────────────

interface ClaudeAuthStatus {
  provider: "claude"
  loggedIn: boolean
  email?: string
  displayName?: string
  accountUuid?: string
  organizationName?: string
}

export function getClaudeAuthStatus(): ClaudeAuthStatus {
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
  return { provider: "claude", loggedIn: false }
}

export function getClaudeLoginUrl(): string | null {
  return getCliLoginUrl("claude")
}

export function completeClaudeLogin(code: string) {
  return completeCliLogin("claude", code, ["claude.com", "oauth", "authorize"])
}

export function logoutClaude(): boolean {
  return logoutCli("claude")
}

// ── Codex ────────────────────────────────────────────────────

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
      const payload = data.tokens.id_token.split(".")[1]
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString())
      return { provider: "codex", loggedIn: true, email: decoded.email, authMode: data.auth_mode || "chatgpt" }
    }
    if (data.OPENAI_API_KEY) {
      return { provider: "codex", loggedIn: true, authMode: "api_key" }
    }
  } catch {}
  return { provider: "codex", loggedIn: false }
}

export function getCodexLoginUrl(): string | null {
  return getCliLoginUrl("codex")
}

export function completeCodexLogin(code: string) {
  return completeCliLogin("codex", code, ["openai.com", "oauth", "auth"])
}

export function logoutCodex(): boolean {
  if (logoutCli("codex")) return true
  try {
    const authPath = join(HOME, ".codex", "auth.json")
    if (existsSync(authPath)) {
      unlinkSync(authPath)
      return true
    }
  } catch {}
  return false
}

// ── Combined ─────────────────────────────────────────────────

export interface AllAuthStatus {
  claude: ClaudeAuthStatus
  codex: CodexAuthStatus
}

export function getAllAuthStatus(): AllAuthStatus {
  return { claude: getClaudeAuthStatus(), codex: getCodexAuthStatus() }
}
