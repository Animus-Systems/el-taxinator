"use client"

import {
  addEntityAction,
  removeEntityAction,
  testConnectionAction,
  autoProvisionDatabaseAction,
  getDockerComposeSnippetAction,
} from "@/actions/entities"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Entity, EntityType } from "@/lib/entities"
import {
  Building2,
  Check,
  Copy,
  Database,
  Loader2,
  Plus,
  Trash2,
  User,
  Zap,
} from "lucide-react"
import { useRouter } from "@/lib/navigation"
import { useReducer, useState, useTransition } from "react"
import { useTranslations } from "next-intl"

type Props = {
  entities: Entity[]
}

export function EntityManager({ entities: initialEntities }: Props) {
  const router = useRouter()
  const t = useTranslations("settings")
  const [showAddForm, setShowAddForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleRemove = (id: string, name: string) => {
    if (!confirm(t("removeEntityConfirm", { name }))) return
    startTransition(async () => {
      const result = await removeEntityAction(id)
      if (!result.success) alert(result.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {initialEntities.map((entity) => (
        <Card key={entity.id}>
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
                  {entity.type === "sl" ? t("sociedadLimitada") : t("autonomo")} &middot;{" "}
                  <span className="font-mono">{entity.db.replace(/\/\/.*@/, "//***@")}</span>
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(entity.id, entity.name)}
              disabled={isPending || initialEntities.length <= 1}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}

      {showAddForm ? (
        <AddEntityForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false)
            router.refresh()
          }}
        />
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" /> {t("addEntity")}
        </Button>
      )}
    </div>
  )
}

type FormState = {
  name: string
  type: EntityType
  dbMode: "manual" | "docker-compose" | "auto-provision"
  connectionString: string
  dockerSnippet: string
  loading: "idle" | "testing" | "provisioning" | "submitting"
  testResult: { ok: boolean; error?: string } | null
  error: string
  copied: boolean
}

type FormAction =
  | { type: "SET_FIELD"; field: keyof FormState; value: FormState[keyof FormState] }
  | { type: "SET_CONNECTION"; value: string }
  | { type: "PROVISION_SUCCESS"; connectionString: string }
  | { type: "RESET_TEST" }

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value }
    case "SET_CONNECTION":
      return { ...state, connectionString: action.value, testResult: null }
    case "PROVISION_SUCCESS":
      return { ...state, connectionString: action.connectionString, testResult: { ok: true }, dbMode: "manual", loading: "idle" }
    case "RESET_TEST":
      return { ...state, testResult: null }
    default:
      return state
  }
}

const initialFormState: FormState = {
  name: "",
  type: "autonomo",
  dbMode: "manual",
  connectionString: "",
  dockerSnippet: "",
  loading: "idle",
  testResult: null,
  error: "",
  copied: false,
}

function AddEntityForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations("settings")
  const [s, dispatch] = useReducer(formReducer, initialFormState)

  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

  const handleTest = async () => {
    if (!s.connectionString) return
    dispatch({ type: "SET_FIELD", field: "loading", value: "testing" })
    dispatch({ type: "RESET_TEST" })
    const result = await testConnectionAction(s.connectionString)
    dispatch({ type: "SET_FIELD", field: "testResult", value: result })
    dispatch({ type: "SET_FIELD", field: "loading", value: "idle" })
  }

  const handleGenerateSnippet = async () => {
    if (!s.name) return
    const result = await getDockerComposeSnippetAction({ id: slug, name: s.name })
    dispatch({ type: "SET_FIELD", field: "dockerSnippet", value: result.snippet })
  }

  const handleAutoProvision = async () => {
    if (!s.name) { dispatch({ type: "SET_FIELD", field: "error", value: t("enterNameFirst") }); return }
    dispatch({ type: "SET_FIELD", field: "loading", value: "provisioning" })
    dispatch({ type: "SET_FIELD", field: "error", value: "" })
    const result = await autoProvisionDatabaseAction({ id: slug, name: s.name })
    if (result.success && result.connectionString) {
      dispatch({ type: "PROVISION_SUCCESS", connectionString: result.connectionString })
    } else {
      dispatch({ type: "SET_FIELD", field: "error", value: result.error ?? t("provisioningFailed") })
      dispatch({ type: "SET_FIELD", field: "loading", value: "idle" })
    }
  }

  const handleSubmit = async () => {
    if (!s.name || !s.connectionString) { dispatch({ type: "SET_FIELD", field: "error", value: t("nameAndConnectionRequired") }); return }
    dispatch({ type: "SET_FIELD", field: "loading", value: "submitting" })
    dispatch({ type: "SET_FIELD", field: "error", value: "" })
    const result = await addEntityAction({ name: s.name, type: s.type, db: s.connectionString })
    if (result.success) {
      onSuccess()
    } else {
      dispatch({ type: "SET_FIELD", field: "error", value: result.error ?? t("failedToAdd") })
      dispatch({ type: "SET_FIELD", field: "loading", value: "idle" })
    }
  }

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(s.dockerSnippet)
    dispatch({ type: "SET_FIELD", field: "copied", value: true })
    setTimeout(() => dispatch({ type: "SET_FIELD", field: "copied", value: false }), 2000)
  }

  // Alias for readability in JSX
  const name = s.name
  const type = s.type
  const dbMode = s.dbMode
  const connectionString = s.connectionString
  const dockerSnippet = s.dockerSnippet
  const isSubmitting = s.loading === "submitting"
  const isTesting = s.loading === "testing"
  const isProvisioning = s.loading === "provisioning"
  const testResult = s.testResult
  const error = s.error
  const copied = s.copied

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("addEntity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-sm font-medium">{t("entityName")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "name", value: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm bg-background mt-1"
            placeholder="e.g. Seth (Autónomo) or Acme SL"
          />
        </div>

        {/* Type */}
        <div>
          <label className="text-sm font-medium">{t("entityType")}</label>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_FIELD", field: "type", value: "autonomo" })}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                type === "autonomo" ? "bg-green-50 border-green-300 text-green-800" : "hover:bg-muted"
              }`}
            >
              <User className="h-4 w-4" /> {t("autonomo")}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_FIELD", field: "type", value: "sl" })}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                type === "sl" ? "bg-blue-50 border-blue-300 text-blue-800" : "hover:bg-muted"
              }`}
            >
              <Building2 className="h-4 w-4" /> {t("sociedadLimitada")}
            </button>
          </div>
        </div>

        {/* Database */}
        <div>
          <label className="text-sm font-medium">{t("database")}</label>
          <div className="flex gap-1 mt-1 mb-3">
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_FIELD", field: "dbMode", value: "manual" })}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                dbMode === "manual" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Database className="h-3 w-3" /> {t("iHaveDatabase")}
            </button>
            <button
              type="button"
              onClick={() => { dispatch({ type: "SET_FIELD", field: "dbMode", value: "docker-compose" }); handleGenerateSnippet() }}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                dbMode === "docker-compose" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Copy className="h-3 w-3" /> {t("dockerCompose")}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_FIELD", field: "dbMode", value: "auto-provision" })}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded border transition-colors ${
                dbMode === "auto-provision" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Zap className="h-3 w-3" /> {t("autoProvision")}
            </button>
          </div>

          {dbMode === "manual" && (
            <div className="space-y-2">
              <input
                type="text"
                value={connectionString}
                onChange={(e) => dispatch({ type: "SET_CONNECTION", value: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-xs"
                placeholder="postgresql://user:password@host:5432/database"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting || !connectionString}>
                  {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                  {t("testConnection")}
                </Button>
                {testResult && (
                  <span className={`text-xs ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {testResult.ok ? t("connected") : testResult.error}
                  </span>
                )}
              </div>
            </div>
          )}

          {dbMode === "docker-compose" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Copy this snippet into your docker-compose.yml and run <code className="bg-muted px-1 rounded">docker compose up -d</code>.
                Then paste the connection string below.
              </p>
              {dockerSnippet && (
                <div className="relative">
                  <pre className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre max-h-48">{dockerSnippet}</pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1"
                    onClick={handleCopySnippet}
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              )}
              <input
                type="text"
                value={connectionString}
                onChange={(e) => dispatch({ type: "SET_CONNECTION", value: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-xs"
                placeholder="postgresql://taxinator:PASSWORD@db-name:5432/taxinator"
              />
            </div>
          )}

          {dbMode === "auto-provision" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Automatically create a PostgreSQL container using Docker. Requires Docker to be installed and running on this machine.
              </p>
              {connectionString ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <Check className="h-4 w-4" /> {t("databaseProvisioned")}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{connectionString}</p>
                </div>
              ) : (
                <Button onClick={handleAutoProvision} disabled={isProvisioning || !name}>
                  {isProvisioning ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t("creatingDatabase")}</>
                  ) : (
                    <><Zap className="h-4 w-4" /> {t("createDatabase")}</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={isSubmitting || !name || !connectionString}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("addEntity")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
