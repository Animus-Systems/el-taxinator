import { BackupSettings } from "@/components/settings/backup-settings"
import { getCurrentUser } from "@/lib/auth"
import { getAuthUrl, isGoogleDriveConfigured } from "@/lib/google-drive"
import { getSettings } from "@/models/settings"
import { setRequestLocale } from "next-intl/server"

export default async function BackupSettingsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ gdrive?: string; error?: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams

  const user = await getCurrentUser()
  const settings = await getSettings(user.id)

  const configured = isGoogleDriveConfigured(settings)
  let googleAuthUrl: string | null = null
  if (configured) {
    try {
      googleAuthUrl = getAuthUrl(settings)
    } catch {}
  }

  return (
    <div className="w-full max-w-xl">
      <BackupSettings
        isGoogleDriveConnected={!!settings.google_drive_refresh_token}
        isGoogleDriveConfigured={configured}
        googleAuthUrl={googleAuthUrl}
        googleClientId={settings.google_drive_client_id || ""}
        googleClientSecret={settings.google_drive_client_secret ? "••••••••" : ""}
        backupFrequency={settings.backup_frequency || "weekly"}
        backupRetention={settings.backup_retention || "5"}
        lastBackupAt={settings.last_backup_at || null}
        justConnected={sp.gdrive === "connected"}
        oauthError={sp.error || null}
      />
    </div>
  )
}
