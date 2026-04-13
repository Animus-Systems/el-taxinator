/**
 * LLM settings page — SPA equivalent of app/[locale]/(app)/settings/llm/page.tsx
 *
 * Loads settings and fields, renders the LLMSettingsForm component.
 */
import { trpc } from "~/trpc"
import LLMSettingsForm from "@/components/settings/llm-settings-form"

export function LlmSettingsPage() {
  const { data: settings, isLoading: settingsLoading } = trpc.settings.get.useQuery({})
  const { data: fields, isLoading: fieldsLoading } = trpc.fields.list.useQuery({})

  if (settingsLoading || fieldsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl">
      <LLMSettingsForm settings={settings ?? {}} fields={fields ?? []} />
    </div>
  )
}
