"use client"

import { useState, useEffect, useCallback } from "react"

interface ProviderStatus {
  provider: string
  loggedIn: boolean
  email?: string
  displayName?: string
  organizationName?: string
  authMode?: string
}

interface AuthStatus {
  claude: ProviderStatus
  codex: ProviderStatus
}

function ProviderCard({ status, onLogin, onLogout, loading }: {
  status: ProviderStatus
  onLogin: () => void
  onLogout: () => void
  loading: boolean
}) {
  const name = status.provider === "claude" ? "Claude Code" : "Codex"

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${status.loggedIn ? "bg-green-500" : "bg-gray-400"}`} />
        <div>
          <div className="font-medium text-sm">{name}</div>
          {status.loggedIn ? (
            <div className="text-xs text-muted-foreground">
              {status.email || status.displayName || "Authenticated"}
              {status.organizationName && ` - ${status.organizationName}`}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Not connected</div>
          )}
        </div>
      </div>
      <div>
        {status.loggedIn ? (
          <button
            onClick={onLogout}
            disabled={loading}
            className="px-3 py-1 text-xs border rounded hover:bg-red-50 dark:hover:bg-red-950 text-red-600"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onLogin}
            disabled={loading}
            className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            {loading ? "..." : "Connect"}
          </button>
        )}
      </div>
    </div>
  )
}

export function CliAuthSection() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [authCode, setAuthCode] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/cli")
      if (res.ok) setStatus(await res.json())
    } catch {}
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleLogin = async (provider: string) => {
    setLoading(provider)
    setError(null)
    setLoginUrl(null)
    setAuthCode("")

    try {
      const res = await fetch("/api/auth/cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", provider }),
      })
      const data = await res.json()

      if (data.loginUrl) {
        setLoginUrl(data.loginUrl)
        window.open(data.loginUrl, "_blank", "width=600,height=700")
      } else if (data.error) {
        setError(data.error)
      }
    } catch {
      setError("Failed to initiate login")
    } finally {
      setLoading(null)
    }
  }

  const handleCompleteLogin = async () => {
    if (!authCode.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-login", provider: "claude", code: authCode }),
      })
      const data = await res.json()

      if (data.success) {
        setLoginUrl(null)
        setAuthCode("")
        if (data.status) setStatus(data.status)
        else await fetchStatus()
      } else {
        setError(data.error || "Login failed")
      }
    } catch {
      setError("Failed to complete login")
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async (provider: string) => {
    setLoading(provider)
    try {
      const res = await fetch("/api/auth/cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout", provider }),
      })
      const data = await res.json()
      if (data.status) setStatus(data.status)
      else await fetchStatus()
    } catch {} finally {
      setLoading(null)
    }
  }

  if (!status) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">AI Subscriptions</h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">AI Subscriptions</h3>
        <p className="text-sm text-muted-foreground">
          Connect your Claude or Codex subscription to use AI features without API keys.
        </p>
      </div>

      <div className="space-y-2">
        <ProviderCard
          status={status.claude}
          onLogin={() => handleLogin("claude")}
          onLogout={() => handleLogout("claude")}
          loading={loading === "claude"}
        />
        <ProviderCard
          status={status.codex}
          onLogin={() => handleLogin("codex")}
          onLogout={() => handleLogout("codex")}
          loading={loading === "codex"}
        />
      </div>

      {loginUrl && (
        <div className="p-4 border rounded-lg space-y-3 bg-blue-50 dark:bg-blue-950/30">
          <p className="text-sm font-medium">Complete Claude Login</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>
              <a href={loginUrl} target="_blank" rel="noopener" className="underline text-primary">
                Click here to open the Claude login page
              </a>
            </li>
            <li>Sign in with your Claude account</li>
            <li>Copy the authorization code shown after login</li>
            <li>Paste it below and click Complete</li>
          </ol>
          <div className="flex gap-2">
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Paste authorization code here..."
              className="flex-1 px-3 py-1.5 text-sm border rounded bg-background"
              onKeyDown={(e) => e.key === "Enter" && handleCompleteLogin()}
            />
            <button
              onClick={handleCompleteLogin}
              disabled={submitting || !authCode.trim()}
              className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Verifying..." : "Complete"}
            </button>
          </div>
          <button
            onClick={() => { setLoginUrl(null); setAuthCode("") }}
            className="text-xs text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-red-600 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/20">
          {error}
        </div>
      )}
    </div>
  )
}
