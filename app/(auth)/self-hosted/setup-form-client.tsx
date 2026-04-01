"use client"
import { useState, useRef, useEffect } from "react"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormInput } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { DEFAULT_CURRENCIES, DEFAULT_SETTINGS } from "@/models/defaults"
import { selfHostedGetStartedAction } from "../actions"
import { FormSelect } from "@/components/forms/simple"
import { PROVIDERS } from "@/lib/llm-providers"

type Props = {
  defaultProvider: string
  configuredKeys: Record<string, boolean>
}

type AuthStatus = {
  claude?: { loggedIn: boolean; email?: string; displayName?: string }
  codex?: { loggedIn: boolean; email?: string }
}

export default function SelfHostedSetupFormClient({ defaultProvider, configuredKeys }: Props) {
  const [mode, setMode] = useState<"subscription" | "apikey">("subscription")
  const [provider, setProvider] = useState(defaultProvider)
  const selected = PROVIDERS.find(p => p.key === provider)!

  const [apiKey, setApiKey] = useState("")
  const userTyped = useRef(false)

  // CLI auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [authCode, setAuthCode] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  useEffect(() => {
    if (!userTyped.current) {
      setApiKey("")
    }
    userTyped.current = false
  }, [provider])

  // Check CLI auth status on mount
  useEffect(() => {
    fetch("/api/auth/cli")
      .then(res => res.json())
      .then(data => setAuthStatus(data))
      .catch(() => {})
  }, [])

  const handleStartLogin = async () => {
    setLoginLoading(true)
    setLoginError(null)
    setLoginUrl(null)
    setAuthCode("")
    try {
      const res = await fetch("/api/auth/cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", provider: "claude" }),
      })
      const data = await res.json()
      if (data.loginUrl) {
        setLoginUrl(data.loginUrl)
        window.open(data.loginUrl, "_blank", "width=600,height=700")
      } else {
        setLoginError(data.error || "Could not start login")
      }
    } catch {
      setLoginError("Failed to connect")
    } finally {
      setLoginLoading(false)
    }
  }

  const handleCompleteLogin = async () => {
    if (!authCode.trim()) return
    setLoginLoading(true)
    setLoginError(null)
    try {
      const res = await fetch("/api/auth/cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-login", provider: "claude", code: authCode.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setLoginUrl(null)
        setAuthCode("")
        setAuthStatus(data.status)
      } else {
        setLoginError(data.error || "Login failed")
      }
    } catch {
      setLoginError("Failed to complete login")
    } finally {
      setLoginLoading(false)
    }
  }

  const claudeConnected = authStatus?.claude?.loggedIn
  const codexConnected = authStatus?.codex?.loggedIn

  return (
    <form action={selfHostedGetStartedAction} className="flex flex-col gap-6 pt-6 text-left">
      {/* Mode selector */}
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={() => setMode("subscription")}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
            mode === "subscription"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-muted"
          }`}
        >
          Use Subscription
        </button>
        <button
          type="button"
          onClick={() => setMode("apikey")}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
            mode === "apikey"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-muted"
          }`}
        >
          Use API Key
        </button>
      </div>

      {/* Currency selector */}
      <div className="flex justify-center">
        <FormSelectCurrency
          title="Default Currency"
          name="default_currency"
          defaultValue={DEFAULT_SETTINGS.find((s) => s.code === "default_currency")?.value ?? "EUR"}
          currencies={DEFAULT_CURRENCIES}
        />
      </div>

      {mode === "subscription" ? (
        <>
          {/* Hidden form fields for subscription mode */}
          <input type="hidden" name="provider" value="anthropic" />
          <input type="hidden" name={PROVIDERS.find(p => p.key === "anthropic")?.apiKeyName || "anthropic_api_key"} value="" />

          <div className="space-y-3">
            {/* Claude status */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${claudeConnected ? "bg-green-500" : "bg-gray-400"}`} />
                <div>
                  <span className="text-sm font-medium">Claude Code</span>
                  {claudeConnected && authStatus?.claude?.email && (
                    <span className="text-xs text-muted-foreground ml-2">{authStatus.claude.email}</span>
                  )}
                </div>
              </div>
              {claudeConnected ? (
                <span className="text-xs text-green-600 font-medium">Connected</span>
              ) : (
                <button
                  type="button"
                  onClick={handleStartLogin}
                  disabled={loginLoading}
                  className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  {loginLoading ? "..." : "Connect"}
                </button>
              )}
            </div>

            {/* Codex status */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${codexConnected ? "bg-green-500" : "bg-gray-400"}`} />
                <div>
                  <span className="text-sm font-medium">Codex</span>
                  {codexConnected && authStatus?.codex?.email && (
                    <span className="text-xs text-muted-foreground ml-2">{authStatus.codex.email}</span>
                  )}
                </div>
              </div>
              {codexConnected ? (
                <span className="text-xs text-green-600 font-medium">Connected</span>
              ) : (
                <span className="text-xs text-muted-foreground">Not connected</span>
              )}
            </div>

            {/* Login flow */}
            {loginUrl && (
              <div className="p-3 border rounded-lg space-y-2 bg-blue-50 dark:bg-blue-950/30 text-sm">
                <p className="font-medium">Complete Claude Login:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                  <li>
                    <a href={loginUrl} target="_blank" rel="noopener" className="underline text-primary">
                      Open login page
                    </a>{" "}
                    (opens in new tab)
                  </li>
                  <li>Sign in with your Claude account</li>
                  <li>Copy the code shown after login</li>
                  <li>Paste below and click Verify</li>
                </ol>
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Paste code here..."
                    className="flex-1 px-2 py-1 text-xs border rounded bg-background"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCompleteLogin())}
                  />
                  <button
                    type="button"
                    onClick={handleCompleteLogin}
                    disabled={loginLoading || !authCode.trim()}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                  >
                    {loginLoading ? "..." : "Verify"}
                  </button>
                </div>
              </div>
            )}

            {loginError && (
              <p className="text-xs text-red-500">{loginError}</p>
            )}

            {!claudeConnected && !codexConnected && !loginUrl && (
              <p className="text-xs text-muted-foreground text-center">
                Connect your Claude or Codex subscription to process receipts with AI — no API key needed.
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {/* API key mode - original flow */}
          <div className="flex justify-center">
            <FormSelect
              title="LLM provider"
              name="provider"
              value={provider}
              onValueChange={setProvider}
              items={PROVIDERS.map(p => ({
                code: p.key,
                name: p.label,
                logo: p.logo
              }))}
            />
          </div>
          <div>
            <FormInput
              title={`${selected.label} API Key`}
              name={selected.apiKeyName}
              value={apiKey ?? ""}
              onChange={e => {
                setApiKey(e.target.value)
                userTyped.current = true
              }}
              placeholder={configuredKeys[provider] ? "Key already configured (leave blank to keep)" : selected.placeholder}
            />
            <small className="text-xs text-muted-foreground flex justify-center mt-2">
              Get key from
              {"\u00A0"}
              <a href={selected.help.url} target="_blank" className="underline">
                {selected.help.label}
              </a>
            </small>
          </div>
        </>
      )}

      <Button type="submit" className="w-auto p-6">
        Get Started
      </Button>
    </form>
  )
}
