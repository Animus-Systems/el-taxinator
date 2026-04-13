/**
 * Compat shim for next/link — plain <a> with SPA navigation.
 * Uses plain <a> instead of TanStack Router Link to avoid Radix Slot conflicts.
 */
import React, { useCallback, type ComponentPropsWithoutRef } from "react"
import { useNavigate } from "@tanstack/react-router"

type AnchorProps = Omit<ComponentPropsWithoutRef<"a">, "href">

interface LinkProps extends AnchorProps {
  href: string
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
  locale?: string
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, prefetch: _prefetch, replace: _replace, scroll: _scroll, locale: _locale, children, onClick, ...rest }, ref) => {
    const navigate = useNavigate()

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (href.startsWith("http") || href.startsWith("//") || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
          onClick?.(e)
          return
        }
        e.preventDefault()
        navigate({ to: href })
        onClick?.(e)
      },
      [href, navigate, onClick],
    )

    return (
      <a ref={ref} href={href} onClick={handleClick} {...rest}>
        {children}
      </a>
    )
  },
)

Link.displayName = "Link"

export default Link
