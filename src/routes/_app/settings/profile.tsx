/**
 * Profile settings page — SPA equivalent of app/[locale]/(app)/settings/profile/page.tsx
 *
 * The original used getCurrentUser() server-side.
 * In the SPA we fetch the user via tRPC.
 */
import { trpc } from "~/trpc"
import ProfileSettingsForm from "@/components/settings/profile-settings-form"

export function ProfileSettingsPage() {
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
      <ProfileSettingsForm user={user} />
    </div>
  )
}
