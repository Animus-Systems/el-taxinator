import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "../messages/en.json"
import es from "../messages/es.json"

// Extract top-level keys as namespaces so that
// useTranslation("transactions") + t("title") works identically
// to the Next.js useTranslations("transactions") + t("title") pattern.
type NestedRecord = Record<string, unknown>

function extractNamespaces(
  translations: Record<string, unknown>
): Record<string, NestedRecord> {
  const namespaces: Record<string, NestedRecord> = {}
  for (const [ns, values] of Object.entries(translations)) {
    if (typeof values === "object" && values !== null) {
      namespaces[ns] = values as NestedRecord
    }
  }
  return namespaces
}

const enNamespaces = extractNamespaces(en)
const esNamespaces = extractNamespaces(es)

i18n.use(initReactI18next).init({
  resources: {
    en: enNamespaces,
    es: esNamespaces,
  },
  lng: localStorage.getItem("language") || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  // Allow nested key access with dot notation within namespaces
  keySeparator: ".",
  // Default namespace (used when no namespace is specified)
  defaultNS: "app",
  // All available namespaces
  ns: Object.keys(enNamespaces),
})

export default i18n
