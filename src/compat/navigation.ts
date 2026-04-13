/**
 * Compatibility shim for @/lib/navigation.
 *
 * The original exports `{ Link, redirect, usePathname, useRouter }`
 * created from next-intl's `createNavigation(routing)`.
 *
 * In the SPA, we provide TanStack Router equivalents for internal navigation.
 */
import React, { type ComponentPropsWithoutRef } from "react"
import { Link as RouterLink, useNavigate, useRouterState } from "@tanstack/react-router"

type AnchorProps = Omit<ComponentPropsWithoutRef<"a">, "href">

interface LinkProps extends AnchorProps {
  href: string
  locale?: string
  prefetch?: boolean
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, locale: _locale, prefetch: _prefetch, children, ...rest }, ref) => {
    if (href.startsWith("http") || href.startsWith("//")) {
      return React.createElement("a", { ref, href, ...rest }, children)
    }
    return React.createElement(RouterLink, { ref, to: href, ...rest }, children)
  },
)
Link.displayName = "Link"

export function usePathname(): string {
  return useRouterState({
    select: (state) => state.location.pathname,
  })
}

export function useRouter() {
  const navigate = useNavigate()
  return {
    push(href: string) {
      void navigate({ to: href })
    },
    replace(href: string) {
      void navigate({ to: href, replace: true })
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
  throw new Error("REDIRECT")
}
