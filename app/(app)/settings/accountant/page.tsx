import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getAccountantInvites } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { AccountantInviteManager } from "@/components/accountant/invite-manager"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Accountant Access" }

export default async function AccountantSettingsPage() {
  const user = await getCurrentUser()
  const invites = await getAccountantInvites(user.id)

  const invitesWithUrls = invites.map((invite: (typeof invites)[number]) => ({
    ...invite,
    permissions: invite.permissions as AccountantPermissions,
    accessUrl: `${config.app.baseURL}/accountant/${invite.token}`,
  }))

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold mb-2">Accountant Access</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">
        Share read-only access to your financial data with your accountant or advisor. Each invite generates a unique
        link. You control exactly which sections they can see.
      </p>

      <AccountantInviteManager userId={user.id} invites={invitesWithUrls} />
    </div>
  )
}
