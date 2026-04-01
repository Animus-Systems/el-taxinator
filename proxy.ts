import { NextRequest, NextResponse } from "next/server"

const protectedPaths = [
  "/transactions", "/settings", "/export", "/import",
  "/unsorted", "/files", "/dashboard", "/invoices",
  "/quotes", "/clients", "/products", "/tax", "/time", "/apps",
]

const locales = new Set(["en", "es"])
const DEFAULT_LOCALE = "en"

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/") return

  const first = pathname.split("/")[1]
  const hasLocale = locales.has(first)

  // Auth check
  const appPath = hasLocale ? pathname.slice(first.length + 1) || "/" : pathname
  if (protectedPaths.some(p => appPath.startsWith(p))) {
    if (!request.cookies.get("TAXINATOR_ENTITY")?.value) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  // Already has locale prefix — pass through
  if (hasLocale) return

  // No locale prefix — add default locale via rewrite
  const url = request.nextUrl.clone()
  url.pathname = `/${DEFAULT_LOCALE}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Only run on page routes, skip api/static/next internals AND skip locale-prefixed paths
  matcher: ["/((?!api|_next|_vercel|en/|es/|.*\\..*).*)"],
}
