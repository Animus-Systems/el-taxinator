import { useTranslation } from "react-i18next"

/**
 * Compatibility shim: matches the next-intl useTranslations API
 * so existing components work without changes.
 *
 * next-intl: const t = useTranslations("namespace")
 * react-i18next: const { t } = useTranslation("namespace")
 *
 * The returned `t` function works identically.
 */
export function useTranslations(namespace?: string) {
  const { t } = useTranslation(namespace)
  return t
}
