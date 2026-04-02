import createIntlMiddleware from "next-intl/middleware"
import { routing } from "./routing"
import { NextRequest, NextResponse } from "next/server"

const protectedPaths = [
  "/transactions", "/settings", "/export", "/import",
  "/unsorted", "/files", "/dashboard", "/invoices",
  "/quotes", "/clients", "/products", "/tax", "/time", "/apps",
]

const locales = new Set(routing.locales)
const handleIntl = createIntlMiddleware(routing)

/**
 * Combined auth + locale proxy.
 * next-intl middleware handles locale detection and rewrites (e.g. /dashboard → /en/dashboard).
 * We layer auth protection on top — redirect to entity picker if no entity cookie.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth check for root (entity picker / login)
  if (pathname !== "/") {
    const first = pathname.split("/")[1]
    const hasLocale = locales.has(first)
    const appPath = hasLocale ? pathname.slice(first.length + 1) || "/" : pathname

    if (protectedPaths.some(p => appPath.startsWith(p))) {
      if (!request.cookies.get("TAXINATOR_ENTITY")?.value) {
        return NextResponse.redirect(new URL("/", request.url))
      }
    }
  }

  // Root is the entity picker — lives outside [locale], don't rewrite it
  if (request.nextUrl.pathname === "/") return

  // Delegate to next-intl for locale routing on all other pages
  return handleIntl(request)
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
