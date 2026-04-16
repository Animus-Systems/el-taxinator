/**
 * Compatibility shim for @/lib/navigation.
 *
 * The original exports `{ Link, redirect, usePathname, useRouter }`
 * created from next-intl's `createNavigation(routing)`.
 *
 * In the SPA, we provide TanStack Router equivalents for internal navigation.
 */
import React, { type ComponentPropsWithoutRef } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

type AnchorProps = Omit<ComponentPropsWithoutRef<"a">, "href">

interface LinkProps extends AnchorProps {
  href: string
  locale?: string
  prefetch?: boolean
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, locale: _locale, prefetch: _prefetch, children, onClick, ...rest }, ref) => {
    const navigate = useNavigate()
    const isExternal = href.startsWith("http") || href.startsWith("//")

    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (event.defaultPrevented || isExternal) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      event.preventDefault()
      void navigate({ to: href })
    }

    return React.createElement("a", { ref, href, onClick: handleClick, ...rest }, children)
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
