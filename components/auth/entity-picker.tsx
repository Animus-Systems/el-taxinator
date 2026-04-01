"use client"

import { connectAction, addAndConnectAction } from "@/actions/auth"
import { testConnectionAction, autoProvisionDatabaseAction, getDockerComposeSnippetAction } from "@/actions/entities"
import { importBundleAction, readBundleManifestAction } from "@/actions/bundle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Entity, EntityType } from "@/lib/entities"
import { Building2, Check, Copy, Database, FileUp, Loader2, Plus, User, Zap } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useReducer, useState, useTransition } from "react"

type Props = {
  entities: Entity[]
}

export function EntityPicker({ entities }: Props) {
  const router = useRouter()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(entities.length === 0)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importManifest, setImportManifest] = useState<any>(null)
  const [importConnStr, setImportConnStr] = useState("")
  const [importing, setImporting] = useState(false)

  const handleConnect = async (entityId: string) => {
    setConnecting(entityId)
    setError("")
    const result = await connectAction(entityId)
    if (result.success) {
      router.push("/dashboard")
    } else {
      setError(result.error ?? "Connection failed")
      setConnecting(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <Image src="/logo/logo.webp" alt="Taxinator" width={80} height={80} className="mx-auto rounded-2xl" />
          <h1 className="text-3xl font-bold tracking-tight">Taxinator</h1>
          <p className="text-muted-foreground">{"Connect to a company database to get started"}</p>
        </div>

        {/* Entity cards */}
        {entities.length > 0 && (
          <div className="space-y-3">
            {entities.map((entity) => (
              <Card key={entity.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    {entity.type === "sl" ? (
                      <Building2 className="h-5 w-5 text-blue-600" />
                    ) : (
                      <User className="h-5 w-5 text-green-600" />
                    )}
                    <div>
                      <p className="font-medium">{entity.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entity.type === "sl" ? "Sociedad Limitada" : "Autónomo"}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleConnect(entity.id)}
                    disabled={connecting !== null}
                    size="sm"
                  >
                    {connecting === entity.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {"Connecting..."}</>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        {/* Add new company */}
        {showAdd ? (
          <AddCompanyForm
            onSuccess={() => router.push("/dashboard")}
            onCancel={entities.length > 0 ? () => setShowAdd(false) : undefined}
          />
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> {"Add New Company"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowImport(true)}>
              <FileUp className="h-4 w-4" /> {"Import Company"}
            </Button>
          </div>
        )}

        {/* Import from bundle */}
        {showImport && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{"Import from Portable Bundle"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{"Bundle File (.taxinator.zip)"}</label>
                <input
                  type="file"
                  accept=".zip"
                  className="w-full mt-1 text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setImportFile(file)
                    const fd = new FormData()
                    fd.append("bundle", file)
                    const result = await readBundleManifestAction(fd)
                    if (result.success) {
                      setImportManifest(result.manifest)
                    } else {
                      setError(result.error ?? "Invalid bundle")
                    }
                  }}
                />
              </div>

              {importManifest && (
                <>
                  <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                    <p><strong>{importManifest.entity.name}</strong></p>
                    <p className="text-muted-foreground">
                      {importManifest.entity.type === "sl" ? "Sociedad Limitada" : "Autónomo"} &middot; {new Date(importManifest.created).toLocaleDateString()}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">{"Database Connection"}</label>
                    <p className="text-xs text-muted-foreground mb-1">{"Provide an empty database to restore into"}</p>
                    <input
                      type="text"
                      value={importConnStr}
                      onChange={(e) => setImportConnStr(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-xs"
                      placeholder="postgresql://user:password@host:5432/database"
                    />
                  </div>

                  <Button
                    onClick={async () => {
                      if (!importFile || !importConnStr) return
                      setImporting(true)
                      setError("")
                      const fd = new FormData()
                      fd.append("bundle", importFile)
                      fd.append("connectionString", importConnStr)
                      fd.append("entityName", importManifest.entity.name)
                      fd.append("entityType", importManifest.entity.type)
                      const result = await importBundleAction(fd)
                      if (result.success) {
                        router.push("/dashboard")
                      } else {
                        setError(result.error ?? "Import failed")
                      }
                      setImporting(false)
                    }}
                    disabled={importing || !importConnStr}
                  >
                    {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> {"Connecting..."}</> : "Import & Connect"}
                  </Button>
                </>
              )}

              <Button variant="ghost" onClick={() => { setShowImport(false); setImportManifest(null); setImportFile(null) }}>
                {"Cancel"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

type FormState = {
  name: string
  type: EntityType
  mode: "connection-string" | "fields" | "docker" | "auto-provision"
  connectionString: string
  host: string
  port: string
  dbUser: string
  dbPassword: string
  dbName: string
  dockerSnippet: string
  loading: "idle" | "testing" | "provisioning" | "saving"
  testResult: { ok: boolean; error?: string } | null
  error: string
  copied: boolean
}

type FormAction =
  | { type: "SET"; field: keyof FormState; value: string | boolean | null | { ok: boolean; error?: string } }
  | { type: "PROVISION_OK"; connectionString: string }
  | { type: "CLEAR_TEST" }

function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.type) {
    case "SET": return { ...s, [a.field]: a.value }
    case "PROVISION_OK": return { ...s, connectionString: a.connectionString, testResult: { ok: true }, mode: "connection-string", loading: "idle" }
    case "CLEAR_TEST": return { ...s, testResult: null }
    default: return s
  }
}

function buildConnectionString(s: FormState): string {
  if (s.mode === "fields") {
    return `postgresql://${s.dbUser}:${s.dbPassword}@${s.host}:${s.port || "5432"}/${s.dbName}`
  }
  return s.connectionString
}

function AddCompanyForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel?: () => void }) {
  const [s, d] = useReducer(formReducer, {
    name: "", type: "autonomo", mode: "fields",
    connectionString: "", host: "localhost", port: "5432",
    dbUser: "taxinator", dbPassword: "", dbName: "taxinator",
    dockerSnippet: "", loading: "idle", testResult: null, error: "", copied: false,
  })

  const connStr = buildConnectionString(s)
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  const handleTest = async () => {
    d({ type: "SET", field: "loading", value: "testing" })
    d({ type: "CLEAR_TEST" })
    const result = await testConnectionAction(connStr)
    d({ type: "SET", field: "testResult", value: result })
    d({ type: "SET", field: "loading", value: "idle" })
  }

  const handleAutoProvision = async () => {
    if (!s.name) { d({ type: "SET", field: "error", value: "Enter a name first" }); return }
    d({ type: "SET", field: "loading", value: "provisioning" })
    d({ type: "SET", field: "error", value: "" })
    const result = await autoProvisionDatabaseAction({ id: slug, name: s.name })
    if (result.success && result.connectionString) {
      d({ type: "PROVISION_OK", connectionString: result.connectionString })
    } else {
      d({ type: "SET", field: "error", value: result.error ?? "Provisioning failed" })
      d({ type: "SET", field: "loading", value: "idle" })
    }
  }

  const handleGenerateSnippet = async () => {
    if (!s.name) return
    const result = await getDockerComposeSnippetAction({ id: slug, name: s.name })
    d({ type: "SET", field: "dockerSnippet", value: result.snippet })
  }

  const handleSubmit = async () => {
    if (!s.name) { d({ type: "SET", field: "error", value: "Company name is required" }); return }
    if (!connStr) { d({ type: "SET", field: "error", value: "Database connection is required" }); return }
    d({ type: "SET", field: "loading", value: "saving" })
    d({ type: "SET", field: "error", value: "" })
    const result = await addAndConnectAction({ name: s.name, type: s.type, connectionString: connStr })
    if (result.success) {
      onSuccess()
    } else {
      d({ type: "SET", field: "error", value: "error" in result ? result.error ?? "Failed" : "Failed" })
      d({ type: "SET", field: "loading", value: "idle" })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{"Add Company"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-sm font-medium">{"Company Name"}</label>
          <input
            type="text"
            value={s.name}
            onChange={(e) => d({ type: "SET", field: "name", value: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm bg-background mt-1"
            placeholder="e.g. Seth (Autónomo)"
            autoFocus
          />
        </div>

        {/* Type */}
        <div className="flex gap-2">
          <button type="button" onClick={() => d({ type: "SET", field: "type", value: "autonomo" })}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border ${s.type === "autonomo" ? "bg-green-50 border-green-300 text-green-800" : "hover:bg-muted"}`}>
            <User className="h-4 w-4" /> {"Autónomo"}
          </button>
          <button type="button" onClick={() => d({ type: "SET", field: "type", value: "sl" })}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border ${s.type === "sl" ? "bg-blue-50 border-blue-300 text-blue-800" : "hover:bg-muted"}`}>
            <Building2 className="h-4 w-4" /> {"Sociedad Limitada"}
          </button>
        </div>

        {/* Database mode tabs */}
        <div>
          <label className="text-sm font-medium">{"Database Connection"}</label>
          <div className="flex gap-1 mt-1 mb-3 flex-wrap">
            {([
              { key: "fields", label: "Credentials", icon: Database },
              { key: "connection-string", label: "Connection String", icon: Database },
              { key: "auto-provision", label: "Auto (Docker)", icon: Zap },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} type="button"
                onClick={() => {
                  d({ type: "SET", field: "mode", value: key })
                }}
                className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded border ${s.mode === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>

          {s.mode === "fields" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-xs text-muted-foreground">{"Host"}</label>
                <input type="text" value={s.host} onChange={(e) => d({ type: "SET", field: "host", value: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background" placeholder="localhost" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{"Port"}</label>
                <input type="text" value={s.port} onChange={(e) => d({ type: "SET", field: "port", value: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background" placeholder="5432" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{"Username"}</label>
                <input type="text" value={s.dbUser} onChange={(e) => d({ type: "SET", field: "dbUser", value: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background" placeholder="taxinator" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{"Password"}</label>
                <input type="password" value={s.dbPassword} onChange={(e) => d({ type: "SET", field: "dbPassword", value: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background" placeholder="password" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">{"Database Name"}</label>
                <input type="text" value={s.dbName} onChange={(e) => d({ type: "SET", field: "dbName", value: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background" placeholder="taxinator" />
              </div>
            </div>
          )}

          {s.mode === "connection-string" && (
            <input type="text" value={s.connectionString}
              onChange={(e) => { d({ type: "SET", field: "connectionString", value: e.target.value }); d({ type: "CLEAR_TEST" }) }}
              className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-xs"
              placeholder="postgresql://user:password@host:5432/database" />
          )}

          {s.mode === "auto-provision" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{"Creates a PostgreSQL database using Docker automatically."}</p>
              {s.connectionString && s.testResult?.ok ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" /> {"Database ready"}
                </div>
              ) : (
                <Button onClick={handleAutoProvision} disabled={s.loading !== "idle" || !s.name} size="sm">
                  {s.loading === "provisioning" ? <><Loader2 className="h-4 w-4 animate-spin" /> {"Creating..."}</> : <><Zap className="h-4 w-4" /> {"Create Database"}</>}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Test + Submit */}
        <div className="flex items-center gap-2">
          {s.mode !== "auto-provision" && (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={s.loading !== "idle" || !connStr}>
              {s.loading === "testing" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />} {"Test"}
            </Button>
          )}
          {s.testResult && (
            <span className={`text-xs ${s.testResult.ok ? "text-green-600" : "text-red-600"}`}>
              {s.testResult.ok ? "Connected" : s.testResult.error}
            </span>
          )}
        </div>

        {s.error && <p className="text-sm text-red-600">{s.error}</p>}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={s.loading === "saving" || !s.name}>
            {s.loading === "saving" ? <><Loader2 className="h-4 w-4 animate-spin" /> {"Connecting..."}</> : <><Plus className="h-4 w-4" /> {"Add & Connect"}</>}
          </Button>
          {onCancel && <Button variant="ghost" onClick={onCancel}>{"Cancel"}</Button>}
        </div>
      </CardContent>
    </Card>
  )
}
