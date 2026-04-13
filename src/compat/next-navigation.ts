/**
 * Compatibility shim for next/navigation.
 *
 * Provides useSearchParams, useRouter, usePathname, useParams, redirect
 * for components that import from "next/navigation".
 */

import { useMemo } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

export function useSearchParams(): URLSearchParams {
  const search = useRouterState({
    select: (state) => state.location.search,
  })
  return useMemo(() => new URLSearchParams(search), [search])
}

export function usePathname(): string {
  return useRouterState({
    select: (state) => state.location.pathname,
  })
}

export function useParams(): Record<string, string> {
  return useRouterState({
    select: (state) => {
      const match = state.matches[state.matches.length - 1]
      return (match?.params ?? {}) as Record<string, string>
    },
  })
}

function parseHref(href: string) {
  const [path, qs] = href.split("?", 2)
  // Use empty object (not undefined) when no query string so TanStack Router
  // clears existing search params instead of preserving them.
  const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : {}
  return { path: path || "/", search }
}

export function useRouter() {
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

export function redirect(url: string): never {
  window.location.href = url
  // This throw prevents code after redirect() from running,
  // matching Next.js behavior
  throw new Error("REDIRECT")
}

export function notFound(): never {
  throw new Error("NOT_FOUND")
}
