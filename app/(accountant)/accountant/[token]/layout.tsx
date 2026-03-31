import { getAccountantInviteByToken, logAccountantAccess } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { Calculator, Clock, FileText, Receipt } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

export default async function AccountantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)

  if (!invite) {
    notFound()
  }

  const hdrs = await headers()
  const ipAddress = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? undefined
  const userAgent = hdrs.get("user-agent") ?? undefined
  await logAccountantAccess(invite.id, "layout", ipAddress, userAgent)

  const permissions = invite.permissions as AccountantPermissions

  const navItems = [
    permissions.transactions && { href: `/accountant/${token}/transactions`, label: "Transactions", icon: FileText },
    permissions.invoices && { href: `/accountant/${token}/invoices`, label: "Invoices", icon: Receipt },
    permissions.tax && { href: `/accountant/${token}/tax`, label: "Impuestos", icon: Calculator },
    permissions.time && { href: `/accountant/${token}/time`, label: "Time Tracking", icon: Clock },
  ].filter(Boolean) as { href: string; label: string; icon: React.ElementType }[]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo/logo.webp" alt="Logo" className="h-8 w-8 rounded-lg" width={32} height={32} />
          <div>
            <span className="font-semibold text-base">Taxinator</span>
            <span className="text-muted-foreground text-sm ml-2">— Accountant View</span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Shared with: <span className="font-medium text-foreground">{invite.name}</span>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-48 border-r bg-card p-4 flex flex-col gap-1 shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Sections</p>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          ))}
          <div className="mt-auto pt-4 border-t">
            <p className="text-xs text-muted-foreground px-2">Read-only access</p>
          </div>
        </nav>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
