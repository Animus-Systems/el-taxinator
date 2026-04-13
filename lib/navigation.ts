/**
 * Navigation utilities for the SPA.
 *
 * Previously used next-intl/navigation with locale-aware routing.
 * Now uses the SPA compat shim directly (next-intl/navigation is aliased
 * to this shim by vite.config.ts).
 */
import { createNavigation } from "@/src/compat/next-intl-navigation"
import { routing } from "@/routing"

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing)
