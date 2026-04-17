/**
 * Backup settings page — SPA equivalent of app/[locale]/(app)/settings/backups/page.tsx
 *
 * The original called server-side getSettings() and Google Drive helpers.
 * In the SPA, we load settings via tRPC and pass relevant fields to the component.
 * Google Drive auth URL generation is server-only — we pass null for now.
 */
import { trpc } from "~/trpc"
import { BackupSettings } from "@/components/settings/backup-settings"

export function BackupsSettingsPage() {
  const { data: settings, isLoading } = trpc.settings.get.useQuery({})

  // Check URL params for Google Drive callback
  const searchParams = new URLSearchParams(window.location.search)
  const justConnected = searchParams.get("gdrive") === "connected"
  const oauthError = searchParams.get("error") || null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const s = (settings ?? {}) as Record<string, unknown>
  const hasClientId = !!s["google_drive_client_id"]
  const hasClientSecret = !!s["google_drive_client_secret"]
  const isGoogleDriveConfigured = hasClientId && hasClientSecret

  return (
    <div className="w-full max-w-xl">
      <BackupSettings
        isGoogleDriveConnected={!!s["google_drive_refresh_token"]}
        isGoogleDriveConfigured={isGoogleDriveConfigured}
        googleAuthUrl={isGoogleDriveConfigured ? "/api/auth/google-drive" : null}
        googleClientId={(s["google_drive_client_id"] as string) || ""}
        googleClientSecret={s["google_drive_client_secret"] ? "--------" : ""}
        backupFrequency={(s["backup_frequency"] as string) || "weekly"}
        backupRetention={(s["backup_retention"] as string) || "5"}
        lastBackupAt={(s["last_backup_at"] as string) || null}
        justConnected={justConnected}
        oauthError={oauthError}
      />
    </div>
  )
}
