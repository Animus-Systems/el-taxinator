
import { fieldsToJsonSchema } from "@/ai/schema"
import { saveSettingsAction } from "@/actions/settings"
import { FormError } from "@/components/forms/error"
import { FormTextarea } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import type { Field } from "@/lib/db-types"
import { testProviderAction } from "@/actions/settings"
import { CircleCheckBig, Edit, GripVertical, Loader2, Star, Zap } from "lucide-react"
import { Link } from "@/lib/navigation"
import { useState, useActionState } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { PROVIDERS } from "@/lib/llm-providers"
import { useTranslations } from "next-intl"

function getInitialProviderOrder(settings: Record<string, string>) {
  let order: string[] = []
  if (!settings["llm_providers"]) {
    order = PROVIDERS.map(p => p.key)
  } else {
    order = settings["llm_providers"].split(",").map(p => p.trim())
  }
  return order.filter((key, idx) => PROVIDERS.some(p => p.key === key) && order.indexOf(key) === idx)
}

export default function LLMSettingsForm({
  settings,
  fields,
}: {
  settings: Record<string, string>
  fields: Field[]
}) {
  const t = useTranslations("settings")
  const [saveState, saveAction, pending] = useActionState(saveSettingsAction, null)
  const [providerOrder, setProviderOrder] = useState<string[]>(getInitialProviderOrder(settings))
  const [primaryProvider, setPrimaryProvider] = useState(settings["llm_primary_provider"] || providerOrder[0] || "anthropic")
  const [backupProvider, setBackupProvider] = useState(settings["llm_backup_provider"] || providerOrder.find(k => k !== (settings["llm_primary_provider"] || providerOrder[0])) || "")

  const [providerValues, setProviderValues] = useState(() => {
    const values: Record<string, { apiKey: string; model: string; thinking: string; baseUrl: string }> = {}
    PROVIDERS.forEach((provider) => {
      values[provider.key] = {
        apiKey: settings[provider.apiKeyName] || "",
        model: settings[provider.modelName] || provider.defaultModelName,
        thinking: provider.thinkingSettingName ? (settings[provider.thinkingSettingName] || "medium") : "",
        baseUrl: provider.baseUrlName ? (settings[provider.baseUrlName] || "") : "",
      }
    })
    return values
  })

  function handleProviderValueChange(providerKey: string, field: string, value: string) {
    setProviderValues((prev) => {
      const existing = prev[providerKey] ?? { apiKey: "", model: "", thinking: "", baseUrl: "" }
      return {
        ...prev,
        [providerKey]: { ...existing, [field]: value },
      }
    })
  }

  const sensors = useSensors(useSensor(PointerSensor))
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = providerOrder.indexOf(active.id as string)
    const newIndex = providerOrder.indexOf(over.id as string)
    setProviderOrder(arrayMove(providerOrder, oldIndex, newIndex))
  }

  return (
    <>
      <form action={saveAction} className="space-y-6" data-form-type="other" autoComplete="off">
        {/* Hidden fields */}
        <input type="hidden" name="llm_providers" value={providerOrder.join(",")} />
        <input type="hidden" name="llm_primary_provider" value={primaryProvider} />
        <input type="hidden" name="llm_backup_provider" value={backupProvider} />
        {PROVIDERS.map(p => (
          <span key={p.key}>
            <input type="hidden" name={p.apiKeyName} value={providerValues[p.key]?.apiKey || ""} />
            <input type="hidden" name={p.modelName} value={providerValues[p.key]?.model || ""} />
            {p.thinkingSettingName && (
              <input type="hidden" name={p.thinkingSettingName} value={providerValues[p.key]?.thinking || "medium"} />
            )}
            {p.baseUrlName && (
              <input type="hidden" name={p.baseUrlName} value={providerValues[p.key]?.baseUrl || ""} />
            )}
          </span>
        ))}

        {/* Provider cards */}
        <div>
          <label className="text-sm font-medium">{t("aiProviders")}</label>
          <p className="text-xs text-muted-foreground mb-3">
            {t("aiProvidersHint")}
          </p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={providerOrder} strategy={verticalListSortingStrategy}>
              {providerOrder.map((providerKey) => (
                <SortableProviderCard
                  key={providerKey}
                  id={providerKey}
                  providerKey={providerKey}
                  isPrimary={primaryProvider === providerKey}
                  isBackup={backupProvider === providerKey}
                  onSetPrimary={() => {
                    if (backupProvider === providerKey) setBackupProvider(primaryProvider)
                    setPrimaryProvider(providerKey)
                  }}
                  onSetBackup={() => {
                    if (primaryProvider === providerKey) return
                    setBackupProvider(providerKey)
                  }}
                  value={providerValues[providerKey] ?? { apiKey: "", model: "", thinking: "", baseUrl: "" }}
                  onValueChange={handleProviderValueChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Prompt */}
        <FormTextarea
          title={t("promptForFileAnalysis")}
          name="prompt_analyse_new_file"
          defaultValue={settings["prompt_analyse_new_file"] ?? ""}
          className="h-64"
        />

        {/* Save */}
        <div className="flex flex-row items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("saveSettings")}
          </Button>
          {saveState?.success && (
            <p className="text-green-500 flex flex-row items-center gap-2">
              <CircleCheckBig className="w-4 h-4" /> {t("saved")}
            </p>
          )}
        </div>
        {saveState?.error && <FormError>{saveState.error}</FormError>}
      </form>

      {/* JSON schema reference */}
      <Card className="flex flex-col gap-4 p-4 bg-accent mt-12">
        <CardTitle className="flex flex-row justify-between items-center gap-2">
          <span className="text-md font-medium">
            Current JSON Schema for{" "}
            <a href="https://platform.openai.com/docs/guides/structured-outputs" target="_blank" className="underline">
              structured output
            </a>
          </span>
          <Link href="/settings/fields" className="text-xs underline inline-flex flex-row items-center gap-1 text-muted-foreground">
            <Edit className="w-4 h-4" /> Edit Fields
          </Link>
        </CardTitle>
        <pre className="text-xs overflow-hidden text-ellipsis">
          {JSON.stringify(fieldsToJsonSchema(fields), null, 2)}
        </pre>
      </Card>
    </>
  )
}

type SortableProviderCardProps = {
  id: string
  providerKey: string
  isPrimary: boolean
  isBackup: boolean
  onSetPrimary: () => void
  onSetBackup: () => void
  value: { apiKey: string; model: string; thinking: string; baseUrl: string }
  onValueChange: (providerKey: string, field: string, value: string) => void
}

function SortableProviderCard({ id, providerKey, isPrimary, isBackup, onSetPrimary, onSetBackup, value, onValueChange }: SortableProviderCardProps) {
  const t = useTranslations("settings")
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const provider = PROVIDERS.find(p => p.key === providerKey)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; responseTime?: number } | null>(null)
  if (!provider) return null

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testProviderAction({
      provider: providerKey,
      apiKey: value.apiKey,
      model: value.model,
      ...(value.thinking ? { thinking: value.thinking } : {}),
      ...(value.baseUrl ? { baseUrl: value.baseUrl } : {}),
    })
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translateY(${transform.y}px)` : undefined,
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={`rounded-lg p-4 mb-2 border ${
        isPrimary ? "border-yellow-500/50 bg-yellow-50/5" :
        isBackup ? "border-blue-500/30 bg-blue-50/5" :
        "border-border bg-muted/50"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <span {...attributes} {...listeners} className="cursor-grab p-0.5 rounded hover:bg-accent" aria-label={t("dragToReorder")}>
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </span>
        <span className="font-semibold text-sm flex-1">{provider.label}</span>
        <div className="flex items-center gap-2">
          {isPrimary ? (
            <span className="flex items-center gap-1 text-xs font-medium text-yellow-600">
              <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" /> {t("primary")}
            </span>
          ) : (
            <button type="button" onClick={onSetPrimary} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-yellow-600">
              <Star className="w-3.5 h-3.5" /> {t("primary")}
            </button>
          )}
          <span className="text-muted-foreground text-xs">|</span>
          {isBackup ? (
            <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
              {t("backup")}
            </span>
          ) : !isPrimary ? (
            <button type="button" onClick={onSetBackup} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-600">
              {t("backup")}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground/50">{t("backup")}</span>
          )}
        </div>
      </div>

      {/* Settings row */}
      <div className="flex flex-wrap gap-3">
        {/* API key — only for non-subscription providers */}
        {!provider.isSubscription && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">{t("apiKey")}</label>
            <input
              type="text"
              value={value.apiKey}
              onChange={e => onValueChange(providerKey, "apiKey", e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-background font-mono text-xs"
              placeholder={provider.placeholder}
              autoComplete="off"
              data-form-type="other"
            />
            <a href={provider.apiDoc} target="_blank" className="text-xs text-muted-foreground hover:underline mt-0.5 inline-block">
              {provider.apiDocLabel}
            </a>
          </div>
        )}

        {provider.isSubscription && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">{t("auth")}</label>
            <p className="text-sm text-green-600 py-1.5">{t("usesSubscription")}</p>
          </div>
        )}

        {/* Base URL — only for providers with baseUrlName */}
        {provider.baseUrlName && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">{t("baseUrl")}</label>
            <input
              type="text"
              value={value.baseUrl || ""}
              onChange={e => onValueChange(providerKey, "baseUrl", e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-background font-mono text-xs"
              placeholder="https://api.example.com/v1"
              autoComplete="off"
            />
          </div>
        )}

        {/* Model selector */}
        <div className="min-w-[180px]">
          <label className="text-xs text-muted-foreground">{t("model")}</label>
          {provider.freeformModel ? (
            <>
              <input
                type="text"
                value={value.model}
                onChange={e => onValueChange(providerKey, "model", e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-background font-mono text-xs"
                placeholder="model-name"
                list={`models-${providerKey}`}
              />
              {provider.models.length > 0 && (
                <datalist id={`models-${providerKey}`}>
                  {provider.models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </datalist>
              )}
            </>
          ) : (
            <select
              value={value.model}
              onChange={e => onValueChange(providerKey, "model", e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-background"
            >
              {provider.models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Thinking selector — only for providers that support it */}
        {provider.supportsThinking && (
          <div className="min-w-[140px]">
            <label className="text-xs text-muted-foreground">{t("thinking")}</label>
            <select
              value={value.thinking || "medium"}
              onChange={e => onValueChange(providerKey, "thinking", e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-background"
            >
              {provider.thinkingOptions.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Test button */}
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || (!provider.isSubscription && !value.apiKey) || !value.model}
            className="h-[34px]"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {t("test")}
          </Button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`mt-2 text-xs px-2 py-1.5 rounded ${testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {testResult.success
            ? `${t("testSuccess")} (${testResult.responseTime}ms)`
            : `${t("testFailed")}: ${testResult.error}`}
        </div>
      )}
    </div>
  )
}
