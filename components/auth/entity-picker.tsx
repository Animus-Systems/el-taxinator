"use client"

import { connectAction, addAndConnectAction } from "@/actions/auth"
import { testConnectionAction, autoProvisionDatabaseAction, getDockerComposeSnippetAction, removeEntityAction, listDirectoriesAction, createDirectoryAction, readFolderManifestAction, openFromFolderAction } from "@/actions/entities"
import { importBundleAction, readBundleManifestAction } from "@/actions/bundle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Entity, EntityType } from "@/lib/entities"
import { Archive, Building2, Check, ChevronRight, Cloud, Copy, Database, FileUp, Folder, FolderOpen, FolderPlus, FolderUp, HardDrive, Loader2, Plus, Trash2, User, Zap } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useReducer, useState, useTransition } from "react"

type Props = {
  entities: Entity[]
}

export function EntityPicker({ entities }: Props) {
  const router = useRouter()
  const [entityList, setEntityList] = useState(entities)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(entities.length === 0)
  const [showImport, setShowImport] = useState(false)
  const [showOpenFolder, setShowOpenFolder] = useState(false)
  const [openFolderPath, setOpenFolderPath] = useState("")
  const [openFolderManifest, setOpenFolderManifest] = useState<any>(null)
  const [openingFolder, setOpeningFolder] = useState(false)
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

  const handleFolderSelected = async (folderPath: string) => {
    setOpenFolderPath(folderPath)
    setError("")
    const result = await readFolderManifestAction(folderPath)
    if (result.found) {
      setOpenFolderManifest(result.manifest)
    } else if (result.hasData) {
      setError("This folder has database data but no taxinator.json manifest. It may have been created outside Taxinator.")
      setOpenFolderManifest(null)
    } else {
      setError("No Taxinator data found in this folder.")
      setOpenFolderManifest(null)
    }
  }

  const handleOpenFromFolder = async () => {
    if (!openFolderPath) return
    setOpeningFolder(true)
    setError("")
    const result = await openFromFolderAction(openFolderPath)
    if (result.success) {
      const connectResult = await connectAction(result.entityId!)
      if (connectResult.success) {
        router.push("/dashboard")
      } else {
        setError(connectResult.error ?? "Failed to connect")
      }
    } else {
      setError(result.error ?? "Failed to open")
    }
    setOpeningFolder(false)
  }

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const confirmEntity = entityList.find(e => e.id === confirmRemove)

  const handleRemove = async (deleteData: boolean) => {
    if (!confirmRemove) return
    setRemoving(confirmRemove)
    setError("")
    const result = await removeEntityAction(confirmRemove, deleteData)
    if (result.success) {
      setEntityList(prev => prev.filter(e => e.id !== confirmRemove))
    } else {
      setError(result.error ?? "Failed to remove")
    }
    setRemoving(null)
    setConfirmRemove(null)
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
        {entityList.length > 0 && (
          <div className="space-y-3">
            {entityList.map((entity) => (
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
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600"
                      onClick={() => setConfirmRemove(entity.id)}
                      disabled={removing !== null || connecting !== null}
                      title="Remove company"
                    >
                      {removing === entity.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => handleConnect(entity.id)}
                      disabled={connecting !== null || removing !== null}
                      size="sm"
                    >
                      {connecting === entity.id ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> {"Connecting..."}</>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Remove confirmation */}
        {confirmRemove && confirmEntity && (
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="py-4 space-y-3">
              <p className="text-sm font-medium">
                {"Remove "}<strong>{confirmEntity.name}</strong>{"?"}
              </p>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleRemove(false)}
                  disabled={removing !== null}
                >
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-muted-foreground" />}
                  <div className="text-left">
                    <p className="text-sm">{"Disconnect only"}</p>
                    <p className="text-xs text-muted-foreground">{"Remove from Taxinator. Database and files are kept."}</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start border-red-300 hover:bg-red-50"
                  onClick={() => handleRemove(true)}
                  disabled={removing !== null}
                >
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-600" />}
                  <div className="text-left">
                    <p className="text-sm text-red-700">{"Delete everything"}</p>
                    <p className="text-xs text-muted-foreground">{"Stop the database, remove the container, and delete all files."}</p>
                  </div>
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)} disabled={removing !== null}>
                {"Cancel"}
              </Button>
            </CardContent>
          </Card>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        {/* Action buttons */}
        {showAdd ? (
          <AddCompanyForm
            onSuccess={() => router.push("/dashboard")}
            onCancel={entityList.length > 0 ? () => setShowAdd(false) : undefined}
          />
        ) : !showImport && !showOpenFolder ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <Plus className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{"New Company"}</span>
            </button>
            <button
              onClick={() => { setShowOpenFolder(true); setShowImport(false) }}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <FolderOpen className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">{"Open Folder"}</span>
            </button>
            <button
              onClick={() => { setShowImport(true); setShowOpenFolder(false) }}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <Archive className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium">{"Import Backup"}</span>
            </button>
          </div>
        ) : null}

        {/* Open from folder */}
        {showOpenFolder && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{"Open Company from Folder"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {"Browse to an existing company data folder created by Taxinator."}
              </p>
              <FolderPicker
                value={openFolderPath}
                placeholder="Choose a company folder..."
                onChange={handleFolderSelected}
              />

              {openFolderManifest && (
                <>
                  <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      {openFolderManifest.type === "sl" ? (
                        <Building2 className="h-4 w-4 text-blue-600" />
                      ) : (
                        <User className="h-4 w-4 text-green-600" />
                      )}
                      <p className="font-medium">{openFolderManifest.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {openFolderManifest.type === "sl" ? "Sociedad Limitada" : "Autónomo"} &middot; Port {openFolderManifest.port}
                    </p>
                  </div>
                  <Button onClick={handleOpenFromFolder} disabled={openingFolder}>
                    {openingFolder ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {"Starting..."}</>
                    ) : (
                      <><Database className="h-4 w-4" /> {"Open & Connect"}</>
                    )}
                  </Button>
                </>
              )}

              <Button variant="ghost" onClick={() => { setShowOpenFolder(false); setOpenFolderManifest(null); setOpenFolderPath("") }}>
                {"Cancel"}
              </Button>
            </CardContent>
          </Card>
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

type ProvisionInfo = { connectionString: string; port: number; password: string; dataDir: string }

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
  dataVolume: string
  dockerSnippet: string
  provisionInfo: ProvisionInfo | null
  loading: "idle" | "testing" | "provisioning" | "saving"
  testResult: { ok: boolean; error?: string } | null
  error: string
  copied: boolean
  dockerMissing: boolean
}

type FormAction =
  | { type: "SET"; field: keyof FormState; value: string | boolean | null | ProvisionInfo | { ok: boolean; error?: string } }
  | { type: "PROVISION_OK"; connectionString: string }
  | { type: "CLEAR_TEST" }

function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.type) {
    case "SET": return { ...s, [a.field]: a.value }
    case "PROVISION_OK": return { ...s, connectionString: a.connectionString, testResult: { ok: true }, loading: "idle" }
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
    dataVolume: "",
    dockerSnippet: "", provisionInfo: null,
    loading: "idle", testResult: null, error: "", copied: false, dockerMissing: false,
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
    d({ type: "SET", field: "dockerMissing", value: false })
    const result = await autoProvisionDatabaseAction({ id: slug, name: s.name, type: s.type, dataVolume: s.dataVolume || undefined })
    if (result.success && result.connectionString) {
      d({ type: "PROVISION_OK", connectionString: result.connectionString })
      if (result.dataDir) d({ type: "SET", field: "dataVolume", value: result.dataDir })
      // Extract password from connection string for display
      const match = result.connectionString.match(/:([^@]+)@/)
      d({ type: "SET", field: "provisionInfo", value: {
        connectionString: result.connectionString,
        port: result.port!,
        password: match?.[1] ?? "",
        dataDir: result.dataDir ?? "",
      }})
    } else {
      if (result.error?.includes("Docker is not available")) {
        d({ type: "SET", field: "dockerMissing", value: true })
      }
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
    const result = await addAndConnectAction({ name: s.name, type: s.type, connectionString: connStr, dataDir: s.dataVolume || undefined })
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
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{"Creates a PostgreSQL database using Docker. Choose where to store all company data (database + files)."}</p>
              <FolderPicker
                value={s.dataVolume}
                placeholder={`Default: ./data/${slug || "company"}/`}
                onChange={(v) => d({ type: "SET", field: "dataVolume", value: v })}
              />
              {s.provisionInfo ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="h-4 w-4" /> {"Database created successfully"}
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-xs font-mono space-y-1">
                    <p><span className="text-muted-foreground">{"Host: "}</span>{"localhost"}</p>
                    <p><span className="text-muted-foreground">{"Port: "}</span>{s.provisionInfo.port}</p>
                    <p><span className="text-muted-foreground">{"User: "}</span>{"taxinator"}</p>
                    <p><span className="text-muted-foreground">{"Password: "}</span>{s.provisionInfo.password}</p>
                    <p><span className="text-muted-foreground">{"Database: "}</span>{"taxinator"}</p>
                    {s.provisionInfo.dataDir && (
                      <p><span className="text-muted-foreground">{"Data: "}</span>{s.provisionInfo.dataDir}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={s.provisionInfo.connectionString}
                      className="w-full border rounded px-2 py-1.5 text-xs font-mono bg-muted cursor-text"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{"Save these credentials somewhere safe. You'll need them if you reconfigure Taxinator."}</p>
                </div>
              ) : (
                <>
                  {s.dockerMissing && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-2">
                      <p className="font-medium text-amber-800">{"Docker is required for automatic setup"}</p>
                      <p className="text-xs text-amber-700">{"Install Docker Desktop to create databases automatically, or use the Credentials tab to connect to an existing database."}</p>
                      <a
                        href="https://docs.docker.com/get-started/get-docker/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        {"Download Docker Desktop"} <ChevronRight className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  <Button onClick={handleAutoProvision} disabled={s.loading !== "idle" || !s.name} size="sm">
                    {s.loading === "provisioning" ? <><Loader2 className="h-4 w-4 animate-spin" /> {"Creating..."}</> : <><Zap className="h-4 w-4" /> {"Create Database"}</>}
                  </Button>
                </>
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

// ---------------------------------------------------------------------------
// Folder Picker — server-side directory browser
// ---------------------------------------------------------------------------

function FolderPicker({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState("")
  const [parent, setParent] = useState<string | null>(null)
  const [dirs, setDirs] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<{ name: string; path: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [creating, setCreating] = useState(false)

  const browse = async (dirPath?: string) => {
    setLoading(true)
    setShowNewFolder(false)
    setNewFolderName("")
    const result = await listDirectoriesAction(dirPath)
    setCurrent(result.current)
    setParent(result.parent)
    setDirs(result.directories)
    setShortcuts(result.shortcuts ?? [])
    setLoading(false)
  }

  const handleOpen = async () => {
    if (!open) await browse(value || undefined)
    setOpen(!open)
  }

  const handleSelect = () => {
    onChange(current)
    setOpen(false)
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setCreating(true)
    const result = await createDirectoryAction(`${current}/${newFolderName.trim()}`)
    if (result.success) {
      await browse(result.path)
    }
    setCreating(false)
  }

  return (
    <div>
      <label className="text-xs font-medium">{"Company Data Folder"}</label>
      <p className="text-xs text-muted-foreground mb-1">{"Database, receipts, and all files will be stored here."}</p>
      <div className="flex gap-2 mt-1">
        <div className="flex-1 border rounded px-2 py-1.5 text-sm bg-background text-muted-foreground truncate">
          {value || placeholder}
        </div>
        <Button variant="outline" size="sm" onClick={handleOpen} type="button">
          <FolderOpen className="h-4 w-4" /> {"Browse"}
        </Button>
      </div>
      {open && (
        <div className="mt-2 border rounded-lg bg-background overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2 text-xs font-mono truncate">
            <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
            {current}
          </div>

          {/* Cloud storage & external drives shortcuts */}
          {shortcuts.length > 0 && (
            <div className="border-b">
              {shortcuts.map((s) => (
                <button
                  key={s.path}
                  type="button"
                  onClick={() => browse(s.path)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
                >
                  {s.name.startsWith("Google Drive") ? (
                    <Cloud className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <HardDrive className="h-4 w-4 text-orange-500 shrink-0" />
                  )}
                  <span className="truncate">{s.name}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                </button>
              ))}
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {parent && (
                  <button
                    type="button"
                    onClick={() => browse(parent)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
                  >
                    <FolderUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">..</span>
                  </button>
                )}
                {dirs.length === 0 && !showNewFolder && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{"Empty folder"}</p>
                )}
                {dirs.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => browse(`${current}/${dir}`)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
                  >
                    <Folder className="h-4 w-4 text-blue-500" />
                    <span className="truncate">{dir}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </button>
                ))}
              </>
            )}
          </div>

          {/* New folder inline */}
          {showNewFolder ? (
            <div className="px-3 py-2 border-t flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                className="flex-1 border rounded px-2 py-1 text-sm bg-background"
                placeholder="Folder name"
                autoFocus
              />
              <Button size="sm" onClick={handleCreateFolder} disabled={creating || !newFolderName.trim()}>
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowNewFolder(false); setNewFolderName("") }}>
                {"Cancel"}
              </Button>
            </div>
          ) : (
            <div className="px-3 py-2 border-t flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNewFolder(true)}>
                <FolderPlus className="h-4 w-4" /> {"New Folder"}
              </Button>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>{"Cancel"}</Button>
                <Button size="sm" onClick={handleSelect}>{"Select"}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
