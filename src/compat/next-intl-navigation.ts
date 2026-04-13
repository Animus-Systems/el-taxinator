/**
 * Compatibility shim for next-intl/navigation.
 *
 * Provides createNavigation and other exports that lib/navigation.ts uses.
 * Uses plain <a> tags with useNavigate() for SPA navigation — avoids
 * compatibility issues between TanStack Router's Link and Radix's Slot.
 */
import React, { useCallback, type ComponentPropsWithoutRef } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

type AnchorProps = Omit<ComponentPropsWithoutRef<"a">, "href">

interface LinkProps extends AnchorProps {
  href: string
  locale?: string
  prefetch?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, locale: _locale, prefetch: _prefetch, children, onClick, ...rest }, ref) => {
    const navigate = useNavigate()

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Let browser handle external links, modified clicks, and new-tab clicks
        if (
          href.startsWith("http") ||
          href.startsWith("//") ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.button !== 0
        ) {
          onClick?.(e)
          return
        }
        e.preventDefault()
        navigate({ to: href })
        onClick?.(e)
      },
      [href, navigate, onClick],
    )

    return React.createElement("a", { ref, href, onClick: handleClick, ...rest }, children)
  },
)
Link.displayName = "Link"

function usePathname(): string {
  return useRouterState({
    select: (state) => state.location.pathname,
  })
}

function parseHref(href: string) {
  const [path, qs] = href.split("?", 2)
  const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : {}
  return { path: path || "/", search }
}

function useRouter() {
  const navigate = useNavigate()
  return {
    push(href: string) {
      const { path, search } = parseHref(href)
      void navigate({ to: path, search, replace: false })
    },
    replace(href: string) {
      const { path, search } = parseHref(href)
      void navigate({ to: path, search, replace: true })
    },
    back() {
      window.history.back()
    },
    forward() {
      window.history.forward()
    },
    refresh() {
      window.location.reload()
    },
    prefetch(_href: string) {
      // no-op
    },
  }
}

function redirect(url: string): never {
  window.location.href = url
  throw new Error("REDIRECT")
}

/**
 * createNavigation is the next-intl function that creates locale-aware
 * navigation utilities. In the SPA, we return plain browser equivalents.
 */
export function createNavigation(_config: unknown) {
  return {
    Link,
    redirect,
    usePathname,
    useRouter,
  }
}

// Also re-export hooks individually for any component that imports them directly
export { useTranslations } from "./translations"
export { useLocale, useFormatter } from "./next-intl"
