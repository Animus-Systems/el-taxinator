export interface ProviderModel {
  id: string
  name: string
}

export interface ThinkingOption {
  id: string
  name: string
}

export interface ProviderConfig {
  key: string
  label: string
  isSubscription: boolean
  apiKeyName: string
  modelName: string
  defaultModelName: string
  models: ProviderModel[]
  supportsThinking: boolean
  thinkingOptions: ThinkingOption[]
  thinkingSettingName: string
  apiDoc: string
  apiDocLabel: string
  placeholder: string
  help: { url: string; label: string }
  logo: string
  /** Setting key for custom base URL (OpenRouter, custom providers) */
  baseUrlName?: string
  /** Whether the model name is a free-text input instead of a dropdown */
  freeformModel?: boolean
}

export const PROVIDERS: ProviderConfig[] = [
  {
    key: "anthropic",
    label: "Claude",
    isSubscription: true,
    apiKeyName: "anthropic_api_key",
    modelName: "anthropic_model_name",
    defaultModelName: "claude-sonnet-4-6",
    models: [
      { id: "claude-sonnet-4-6", name: "Sonnet 4.6 (fast, recommended)" },
      { id: "claude-opus-4-7", name: "Opus 4.7 (most powerful)" },
      { id: "claude-haiku-4-5", name: "Haiku 4.5 (cheapest)" },
      { id: "claude-sonnet-4-5", name: "Sonnet 4.5 (balanced)" },
    ],
    supportsThinking: true,
    thinkingOptions: [
      { id: "low", name: "Low (fast)" },
      { id: "medium", name: "Medium (balanced)" },
      { id: "high", name: "High (thorough)" },
    ],
    thinkingSettingName: "anthropic_thinking",
    apiDoc: "https://console.anthropic.com/settings/keys",
    apiDocLabel: "Anthropic Console",
    placeholder: "sk-ant-...",
    help: { url: "https://console.anthropic.com/settings/keys", label: "Anthropic Console" },
    logo: "/logo/logo.webp",
  },
  {
    key: "codex",
    label: "Codex",
    isSubscription: true,
    apiKeyName: "codex_api_key",
    modelName: "codex_model_name",
    defaultModelName: "gpt-5.3-codex",
    models: [
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex (default)" },
      { id: "gpt-5.4", name: "GPT-5.4 (latest)" },
      { id: "o3", name: "o3 (reasoning)" },
      { id: "o4-mini", name: "o4 Mini (fast)" },
    ],
    supportsThinking: false,
    thinkingOptions: [],
    thinkingSettingName: "",
    apiDoc: "https://platform.openai.com",
    apiDocLabel: "OpenAI Platform",
    placeholder: "",
    help: { url: "https://platform.openai.com", label: "OpenAI Platform" },
    logo: "/logo/openai.svg",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    isSubscription: false,
    apiKeyName: "openrouter_api_key",
    modelName: "openrouter_model_name",
    defaultModelName: "anthropic/claude-sonnet-4",
    models: [
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (recommended)" },
      { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4 (fast)" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    ],
    freeformModel: true,
    supportsThinking: false,
    thinkingOptions: [],
    thinkingSettingName: "",
    apiDoc: "https://openrouter.ai/settings/keys",
    apiDocLabel: "OpenRouter Dashboard",
    placeholder: "sk-or-...",
    help: { url: "https://openrouter.ai/settings/keys", label: "OpenRouter Dashboard" },
    logo: "/logo/openrouter.svg",
  },
  {
    key: "google",
    label: "Google Gemini",
    isSubscription: false,
    apiKeyName: "google_api_key",
    modelName: "google_model_name",
    defaultModelName: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (fast, cheap)" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite (cheapest)" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (powerful)" },
    ],
    supportsThinking: false,
    thinkingOptions: [],
    thinkingSettingName: "",
    apiDoc: "https://aistudio.google.com/apikey",
    apiDocLabel: "Google AI Studio",
    placeholder: "AIza...",
    help: { url: "https://aistudio.google.com/apikey", label: "Google AI Studio" },
    logo: "/logo/google.svg",
  },
  {
    key: "openai",
    label: "OpenAI",
    isSubscription: false,
    apiKeyName: "openai_api_key",
    modelName: "openai_model_name",
    defaultModelName: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini (fast, cheap)" },
      { id: "gpt-4o", name: "GPT-4o (balanced)" },
      { id: "gpt-4.1", name: "GPT-4.1 (latest)" },
    ],
    supportsThinking: false,
    thinkingOptions: [],
    thinkingSettingName: "",
    apiDoc: "https://platform.openai.com/settings/organization/api-keys",
    apiDocLabel: "OpenAI Platform Console",
    placeholder: "sk-...",
    help: { url: "https://platform.openai.com/settings/organization/api-keys", label: "OpenAI Platform Console" },
    logo: "/logo/openai.svg",
  },
  {
    key: "mistral",
    label: "Mistral",
    isSubscription: false,
    apiKeyName: "mistral_api_key",
    modelName: "mistral_model_name",
    defaultModelName: "mistral-medium-latest",
    models: [
      { id: "mistral-medium-latest", name: "Medium (balanced)" },
      { id: "mistral-small-latest", name: "Small (fast)" },
      { id: "mistral-large-latest", name: "Large (powerful)" },
    ],
    supportsThinking: false,
    thinkingOptions: [],
    thinkingSettingName: "",
    apiDoc: "https://admin.mistral.ai/organization/api-keys",
    apiDocLabel: "Mistral Admin Console",
    placeholder: "...",
    help: { url: "https://admin.mistral.ai/organization/api-keys", label: "Mistral Admin Console" },
    logo: "/logo/mistral.svg",
  },
  {
    key: "custom",
    label: "Custom (OpenAI-compatible)",
    isSubscription: false,
    apiKeyName: "custom_api_key",
    modelName: "custom_model_name",
    defaultModelName: "",
    baseUrlName: "custom_base_url",
    freeformModel: true,
    models: [],
    supportsThinking: false,
    thinkingOptions: [],
    thinkingSettingName: "",
    apiDoc: "",
    apiDocLabel: "",
    placeholder: "sk-...",
    help: { url: "", label: "" },
    logo: "/logo/logo.webp",
  },
]

/**
 * True when the user has at least one usable LLM provider.
 *
 * A provider counts as "configured" when:
 *   - its API key is set in settings, OR
 *   - it's a subscription provider (Claude CLI, codex CLI) and the user has
 *     picked it as `llm_primary_provider` or `llm_backup_provider` — those
 *     auth via a locally-installed CLI, not via an API key.
 */
export function hasAnyProviderConfigured(settings: Record<string, string>): boolean {
  const primary = settings["llm_primary_provider"]?.trim() ?? ""
  const backup = settings["llm_backup_provider"]?.trim() ?? ""
  return PROVIDERS.some((provider) => {
    const apiKey = settings[provider.apiKeyName]
    if (typeof apiKey === "string" && apiKey.trim().length > 0) return true
    if (provider.isSubscription && (provider.key === primary || provider.key === backup)) {
      return true
    }
    return false
  })
}
