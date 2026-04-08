"use client"

import { connectAction, addAndConnectAction } from "@/actions/auth"
import { removeEntityAction, listDirectoriesAction, createDirectoryAction } from "@/actions/entities"
import { importBundleAction, readBundleManifestAction } from "@/actions/bundle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Entity, EntityType } from "@/lib/entities"
import { Archive, Building2, ChevronRight, Cloud, Folder, FolderOpen, FolderPlus, FolderUp, HardDrive, Loader2, Plus, Trash2, User } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"

type Props = {
  entities: Entity[]
}

type BundleManifest = {
  version: string
  entity: { id: string; name: string; type: string }
  created: string
  dbDumpFile: string
}

export function EntityPicker({ entities }: Props) {
  const router = useRouter()
  const [entityList, setEntityList] = useState(entities)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [showAdd, setShowAdd] = useState(entities.length === 0)
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importManifest, setImportManifest] = useState<BundleManifest | null>(null)
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
          <p className="text-muted-foreground">{"Choose a company to get started"}</p>
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
                    <p className="text-xs text-muted-foreground">{"Remove the entity and delete its uploads folder."}</p>
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
        ) : !showImport ? (
          <div className="grid grid-cols-2 gap-2">
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

function AddCompanyForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel?: () => void }) {
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("autonomo")
  const [dataDir, setDataDir] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    if (!name) {
      setError("Company name is required")
      return
    }
    setLoading(true)
    setError("")
    const result = await addAndConnectAction({ name, type, dataDir: dataDir || undefined })
    if (result.success) {
      onSuccess()
    } else {
      setError("error" in result && result.error ? result.error : "Failed")
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

        {/* Optional data directory */}
        <FolderPicker
          value={dataDir}
          placeholder="Default: ./data/uploads/"
          onChange={setDataDir}
        />

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

// ---------------------------------------------------------------------------
// Folder Picker — server-side directory browser (used to choose where uploads go)
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
      <label className="text-xs font-medium">{"Uploads Folder (optional)"}</label>
      <p className="text-xs text-muted-foreground mb-1">{"Where receipts and files for this company are stored."}</p>
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
