import { getAccountantInviteByToken } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { Calculator, Clock, FileText, Receipt } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function AccountantPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)
  if (!invite) notFound()

  const permissions = invite.permissions as AccountantPermissions

  const sections = [
    permissions.transactions && {
      href: `/accountant/${token}/transactions`,
      label: "Transactions",
      description: "View all financial transactions",
      icon: FileText,
    },
    permissions.invoices && {
      href: `/accountant/${token}/invoices`,
      label: "Invoices",
      description: "View invoices and quotes",
      icon: Receipt,
    },
    permissions.tax && {
      href: `/accountant/${token}/tax`,
      label: "Impuestos",
      description: "View tax reports and forms",
      icon: Calculator,
    },
    permissions.time && {
      href: `/accountant/${token}/time`,
      label: "Time Tracking",
      description: "View time entries",
      icon: Clock,
    },
  ].filter(Boolean) as { href: string; label: string; description: string; icon: React.ElementType }[]

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Accountant Portal</h1>
      <p className="text-muted-foreground mb-6">
        Welcome, <strong>{invite.name}</strong>. You have read-only access to the following sections.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
          >
            <Icon className="h-6 w-6 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
