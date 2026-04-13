/**
 * Business settings page — SPA equivalent of app/[locale]/(app)/settings/business/page.tsx
 *
 * The original used getCurrentUser() to get the user object.
 * In the SPA we fetch the user via tRPC (users.me) instead.
 */
import { trpc } from "~/trpc"
import BusinessSettingsForm from "@/components/settings/business-settings-form"

export function BusinessSettingsPage() {
  const { data: user, isLoading } = trpc.users.me.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">User not found</div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl">
      <BusinessSettingsForm user={user} />
    </div>
  )
}
