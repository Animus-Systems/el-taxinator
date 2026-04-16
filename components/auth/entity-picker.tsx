
import { connectAction, addAndConnectAction } from "@/actions/auth"
import { removeEntityAction, disconnectEntityAction, listDirectoriesAction } from "@/actions/entities"
import { importBundleAction, readBundleManifestAction } from "@/actions/bundle"
import {
  getDataLocationAction,
  scanForProfilesAction,
  adoptProfilesAction,
} from "@/actions/config"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Entity, EntityType } from "@/lib/entities"
import { folderNameFromName } from "@/lib/utils"
import {
  Archive,
  Building2,
  ChevronRight,
  Copy,
  Check,
  FolderOpen,
  HardDrive,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  User,
} from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, useEffect, useTransition } from "react"

type Props = {
  entities: Entity[]
}

type BundleManifest = {
  version: string
  entity: { id: string; name: string; type: string }
  created: string
  dbDumpFile: string
}

type DiscoveredProfile = {
  id: string
  hasDb: boolean
  type: EntityType
  selected: boolean
}

export function EntityPicker({ entities }: Props) {
  const router = useRouter()
  const [entityList, setEntityList] = useState(entities)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importManifest, setImportManifest] = useState<BundleManifest | null>(null)
  const [importing, setImporting] = useState(false)

  // Data location state
  const [dataDir, setDataDir] = useState("")
  const [showFolderBrowser, setShowFolderBrowser] = useState(false)
  const [discoveredProfiles, setDiscoveredProfiles] = useState<DiscoveredProfile[]>([])
  const [scanDir, setScanDir] = useState("")
  const [adopting, setAdopting] = useState(false)

  useEffect(() => {
    getDataLocationAction().then((result) => setDataDir(result.dataDir))
  }, [])

  const handleScanFolder = async (selectedDir: string) => {
    setShowFolderBrowser(false)
    setError("")

    const scan = await scanForProfilesAction(selectedDir)
    if (scan.profiles.length > 0) {
      setDiscoveredProfiles(
        scan.profiles.map((p) => ({
          ...p,
          type: "autonomo" as EntityType,
          selected: true,
        })),
      )
      setScanDir(selectedDir)
    } else {
      setDiscoveredProfiles([])
      setError("No existing profiles found in that folder.")
    }
  }

  const handleAdoptProfiles = async () => {
    const selected = discoveredProfiles.filter((p) => p.selected)
    if (selected.length === 0) return
    setAdopting(true)
    setError("")
    const result = await adoptProfilesAction(
      scanDir,
      selected.map((p) => ({ id: p.id, type: p.type })),
    )
    if (result.success) {
      // Profiles registered — reload to show them in the entity list
      window.location.reload()
    } else {
      setError("Failed to adopt profiles")
      setAdopting(false)
    }
  }

  const [schemaMessage, setSchemaMessage] = useState("")

  const handleConnect = async (entityId: string) => {
    setConnecting(entityId)
    setError("")
    setSchemaMessage("")
    const result = await connectAction(entityId)
    if (!result.success) {
      setError(result.error ?? "Connection failed")
      setConnecting(null)
      return
    }

    const schema = (result as Record<string, unknown>)["schema"] as { status: string; migrationsRan?: number; descriptions?: string[] } | undefined
    if (schema?.status === "migrated") {
      setSchemaMessage(`Database updated (${schema.migrationsRan} migration${(schema.migrationsRan ?? 0) > 1 ? "s" : ""}): ${schema.descriptions?.join(", ")}`)
      // Brief pause so user sees the message before navigating
      await new Promise(r => setTimeout(r, 2000))
    } else if (schema?.status === "fresh") {
      setSchemaMessage("New database initialized")
      await new Promise(r => setTimeout(r, 1000))
    }

    // Hard navigate — server state changed (new DB connection), SPA cache is stale
    window.location.href = "/dashboard"
  }

  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "disconnect" | "delete" } | null>(null)
  const confirmEntity = entityList.find(e => e.id === confirmAction?.id)

  const handleConfirmedAction = async () => {
    if (!confirmAction) return
    const pendingAction = confirmAction
    setRemoving(pendingAction.id)
    setError("")

    try {
      const result = pendingAction.action === "delete"
        ? await removeEntityAction(pendingAction.id)
        : await disconnectEntityAction(pendingAction.id)

      if (!result.success) {
        setError(result.error ?? "Failed")
        setRemoving(null)
        return
      }

      setEntityList((prev) => prev.filter((entity) => entity.id !== pendingAction.id))
      setConfirmAction(null)
      setRemoving(null)
      router.refresh()
    } catch {
      setError("Failed")
      setRemoving(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <Image src="/logo/logo.webp" alt="Taxinator" width={80} height={80} className="mx-auto rounded-2xl" />
          <h1 className="text-3xl font-bold tracking-tight">Taxinator</h1>
          <p className="text-muted-foreground">{"Choose a company to get started"}</p>
        </div>

        {/* Folder browser (triggered by "Open Folder" button) */}
        {showFolderBrowser && (
          <InlineFolderBrowser
            initialPath={dataDir || "/"}
            onSelect={handleScanFolder}
            onCancel={() => setShowFolderBrowser(false)}
          />
        )}

        {/* Discovered profiles */}
        {discoveredProfiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {"Found " + discoveredProfiles.length + " existing profile" + (discoveredProfiles.length > 1 ? "s" : "")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {discoveredProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 p-2 rounded-lg border"
                >
                  <input
                    type="checkbox"
                    checked={profile.selected}
                    onChange={(e) =>
                      setDiscoveredProfiles((prev) =>
                        prev.map((p) =>
                          p.id === profile.id
                            ? { ...p, selected: e.target.checked }
                            : p,
                        ),
                      )
                    }
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {profile.id.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDiscoveredProfiles((prev) =>
                          prev.map((p) =>
                            p.id === profile.id
                              ? { ...p, type: "autonomo" }
                              : p,
                          ),
                        )
                      }
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${
                        profile.type === "autonomo"
                          ? "bg-green-50 border-green-300 text-green-800"
                          : "hover:bg-muted"
                      }`}
                    >
                      <User className="h-3 w-3" />
                      {"Autonomo"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDiscoveredProfiles((prev) =>
                          prev.map((p) =>
                            p.id === profile.id ? { ...p, type: "sl" } : p,
                          ),
                        )
                      }
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${
                        profile.type === "sl"
                          ? "bg-blue-50 border-blue-300 text-blue-800"
                          : "hover:bg-muted"
                      }`}
                    >
                      <Building2 className="h-3 w-3" />
                      {"SL"}
                    </button>
                  </div>
                </div>
              ))}
              <Button
                onClick={handleAdoptProfiles}
                disabled={
                  adopting ||
                  discoveredProfiles.filter((p) => p.selected).length === 0
                }
                className="w-full"
              >
                {adopting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />{" "}
                    {"Adding..."}
                  </>
                ) : (
                  "Add to List"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Entity cards */}
        {entityList.length > 0 && (
          <div className="space-y-3">
            {entityList.map((entity) => {
              const entityPath = entity.dataDir ?? dataDir + "/" + entity.id
              return (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  entityPath={entityPath}
                  connecting={connecting === entity.id}
                  disabled={connecting !== null || removing !== null}
                  removing={removing === entity.id}
                  onConnect={() => handleConnect(entity.id)}
                  onDisconnect={() => setConfirmAction({ id: entity.id, action: "disconnect" })}
                  onDelete={() => setConfirmAction({ id: entity.id, action: "delete" })}
                />
              )
            })}
          </div>
        )}

        {/* Action confirmation */}
        {confirmAction && confirmEntity && (
          <Card className={confirmAction.action === "delete" ? "border-red-200 bg-red-50/50" : "border-orange-200 bg-orange-50/50"}>
            <CardContent className="py-4 space-y-3">
              <p className="text-sm font-medium">
                {confirmAction.action === "delete" ? "Delete " : "Disconnect "}
                <strong>{confirmEntity.name}</strong>{"?"}
              </p>
              <p className="text-xs text-muted-foreground">
                {confirmAction.action === "delete"
                  ? "This will permanently delete all data (database, uploads) for this company."
                  : "This will remove the company from the list. Its data folder will be kept and can be re-adopted later."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant={confirmAction.action === "delete" ? "destructive" : "default"}
                  size="sm"
                  onClick={handleConfirmedAction}
                  disabled={removing !== null}
                >
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmAction.action === "delete" ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                  {confirmAction.action === "delete" ? "Delete" : "Disconnect"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)} disabled={removing !== null}>
                  {"Cancel"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        {schemaMessage && (
          <p className="text-sm text-blue-600 text-center bg-blue-50 rounded-lg px-3 py-2">{schemaMessage}</p>
        )}

        {/* Action buttons */}
        {showAdd ? (
          <AddCompanyForm
            dataDir={dataDir}
            onSuccess={() => router.push("/dashboard")}
            {...(entityList.length > 0 ? { onCancel: () => setShowAdd(false) } : {})}
          />
        ) : !showImport ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <Plus className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{"New Company"}</span>
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <Archive className="h-5 w-5 text-orange-600" />
              <span className="text-sm font-medium">{"Import Backup"}</span>
            </button>
            <button
              onClick={() => setShowFolderBrowser(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
            >
              <FolderOpen className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">{"Open Folder"}</span>
            </button>
          </div>
        ) : null}

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
                      setImportManifest(result.manifest ?? null)
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

                  <p className="text-xs text-muted-foreground">
                    {"This will create a new company in your local database and restore the bundle into it."}
                  </p>

                  <Button
                    onClick={async () => {
                      if (!importFile) return
                      setImporting(true)
                      setError("")
                      const fd = new FormData()
                      fd.append("bundle", importFile)
                      fd.append("entityName", importManifest.entity.name)
                      fd.append("entityType", importManifest.entity.type)
                      const result = await importBundleAction(fd)
                      if (result.success) {
                        router.push("/dashboard")
                      } else {
                        setError(result.error ?? "Import failed")
                        setImporting(false)
                      }
                    }}
                    disabled={importing}
                  >
                    {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> {"Importing..."}</> : "Import & Connect"}
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

function EntityCard({
  entity,
  entityPath,
  connecting,
  disabled,
  removing,
  onConnect,
  onDisconnect,
  onDelete,
}: {
  entity: Entity
  entityPath: string
  connecting: boolean
  disabled: boolean
  removing: boolean
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(entityPath)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-4 space-y-3">
        {/* Header: name + connect */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {entity.type === "sl" ? (
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
            ) : (
              <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
                <User className="h-5 w-5 text-green-600" />
              </div>
            )}
            <div>
              <p className="font-medium">{entity.name}</p>
              <p className="text-xs text-muted-foreground">
                {entity.type === "sl" ? "Sociedad Limitada" : "Autónomo"}
              </p>
            </div>
          </div>
          <Button onClick={onConnect} disabled={disabled} size="sm">
            {connecting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> {"Connecting..."}</>
            ) : (
              "Connect"
            )}
          </Button>
        </div>

        {/* Data path + actions */}
        <div className="bg-muted/50 rounded-lg px-3 py-2 space-y-1.5">
          <div className="flex items-start gap-2">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground break-all font-mono leading-relaxed flex-1">
              {entityPath}
            </p>
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
              title="Copy path"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-1 pt-0.5">
            <button
              onClick={onDisconnect}
              disabled={disabled}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600 disabled:opacity-50 transition-colors"
            >
              <LogOut className="h-3 w-3" /> {"Disconnect"}
            </button>
            <span className="text-muted-foreground/40">{"·"}</span>
            <button
              onClick={onDelete}
              disabled={disabled}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors"
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {"Delete"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function InlineFolderBrowser({
  initialPath,
  onSelect,
  onCancel,
}: {
  initialPath: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [currentDir, setCurrentDir] = useState(initialPath)
  const [directories, setDirectories] = useState<string[]>([])
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [shortcuts, setShortcuts] = useState<{ name: string; path: string }[]>(
    [],
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listDirectoriesAction(currentDir).then((result) => {
      if (cancelled) return
      setCurrentDir(result.current)
      setDirectories(result.directories)
      setParentDir(result.parent)
      setShortcuts(result.shortcuts)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentDir])

  const navigate = (dir: string) => {
    setCurrentDir(dir)
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        {/* Current path */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="truncate font-mono text-xs">{currentDir}</span>
        </div>

        {/* Shortcuts */}
        {shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Button
                key={s.path}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => navigate(s.path)}
              >
                <HardDrive className="h-3 w-3 mr-1" />
                {s.name}
              </Button>
            ))}
          </div>
        )}

        {/* Directory list */}
        <div className="border rounded-md max-h-60 overflow-y-auto">
          {parentDir && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left border-b"
              onClick={() => navigate(parentDir)}
            >
              <ChevronRight className="h-4 w-4 rotate-180 text-muted-foreground" />
              <span>{".."}</span>
            </button>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : directories.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              {"No subfolders"}
            </p>
          ) : (
            directories.map((dir) => (
              <button
                key={dir}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                onClick={() => navigate(currentDir + "/" + dir)}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{dir}</span>
                <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </button>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {"Cancel"}
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => {
              startTransition(() => {
                onSelect(currentDir)
              })
            }}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {"Select Folder"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function AddCompanyForm({ dataDir: appDataDir, onSuccess, onCancel }: { dataDir: string; onSuccess: () => void; onCancel?: () => void }) {
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("autonomo")
  const [customDataDir, setCustomDataDir] = useState("")
  const [showDirPicker, setShowDirPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const folderName = folderNameFromName(name) || "company"
  const folderPreview = customDataDir ? `${customDataDir}/${folderName}` : null

  const handleSubmit = async () => {
    if (!name) {
      setError("Company name is required")
      return
    }
    setLoading(true)
    setError("")
    try {
      const result = await addAndConnectAction({
        name,
        type,
        ...(customDataDir ? { dataDir: customDataDir } : {}),
      })
      if (result && !result.success) {
        setError("error" in result && result.error ? result.error : "Failed")
        setLoading(false)
        return
      }
      onSuccess()
    } catch {
      setError("Failed")
      setLoading(false)
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-background mt-1"
            placeholder="e.g. Seth (Autónomo)"
            autoFocus
          />
        </div>

        {/* Type */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("autonomo")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border ${type === "autonomo" ? "bg-green-50 border-green-300 text-green-800" : "hover:bg-muted"}`}
          >
            <User className="h-4 w-4" /> {"Autónomo"}
          </button>
          <button
            type="button"
            onClick={() => setType("sl")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border ${type === "sl" ? "bg-blue-50 border-blue-300 text-blue-800" : "hover:bg-muted"}`}
          >
            <Building2 className="h-4 w-4" /> {"Sociedad Limitada"}
          </button>
        </div>

        {/* Data folder */}
        <div>
          <label className="text-sm font-medium">{"Parent Folder"}</label>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 border rounded px-3 py-2 text-sm bg-muted/50 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {customDataDir || "Default (inside app data folder)"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowDirPicker(!showDirPicker)}>
              <FolderOpen className="h-4 w-4" />
            </Button>
            {customDataDir && (
              <Button variant="ghost" size="sm" onClick={() => { setCustomDataDir(""); setShowDirPicker(false) }}>
                {"Reset"}
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {folderPreview
              ? `Will create: ${folderPreview}`
              : `Will create: ${appDataDir}/${folderName}`}
          </p>
        </div>

        {showDirPicker && (
          <InlineFolderBrowser
            initialPath={customDataDir || appDataDir || "/"}
            onSelect={(dir) => {
              setCustomDataDir(dir)
              setShowDirPicker(false)
            }}
            onCancel={() => setShowDirPicker(false)}
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={loading || !name}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> {"Creating..."}</> : <><Plus className="h-4 w-4" /> {"Create & Connect"}</>}
          </Button>
          {onCancel && <Button variant="ghost" onClick={onCancel}>{"Cancel"}</Button>}
        </div>
      </CardContent>
    </Card>
  )
}
