
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Cloud, CloudOff, Download, Loader2, Package } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

type Props = {
  isGoogleDriveConnected: boolean
  isGoogleDriveConfigured: boolean
  googleAuthUrl: string | null
  googleClientId: string
  googleClientSecret: string
  backupFrequency: string
  backupRetention: string
  lastBackupAt: string | null
  justConnected: boolean
  oauthError: string | null
}

export function BackupSettings({
  isGoogleDriveConnected,
  isGoogleDriveConfigured,
  googleAuthUrl,
  googleClientId: initialClientId,
  googleClientSecret: initialClientSecret,
  backupFrequency,
  backupRetention,
  lastBackupAt,
  justConnected,
  oauthError,
}: Props) {
  const [downloading, setDownloading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [frequency, setFrequency] = useState(backupFrequency)
  const [retention, setRetention] = useState(backupRetention)
  const [backingUpNow, setBackingUpNow] = useState(false)
  const [clientId, setClientId] = useState(initialClientId)
  const [clientSecret, setClientSecret] = useState(initialClientSecret)
  const [savingGoogle, setSavingGoogle] = useState(false)
  const [googleSaved, setGoogleSaved] = useState(isGoogleDriveConfigured)
  const [backupResult, setBackupResult] = useState<string | null>(null)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch("/api/export/bundle")
      if (!response.ok) throw new Error("Export failed")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "backup.taxinator.zip"
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setDownloading(false)
    }
  }

  const handleBackupNow = async () => {
    setBackingUpNow(true)
    setBackupResult(null)
    try {
      const response = await fetch("/api/cron/backup")
      const data = await response.json()
      const result = data.results?.[0]
      if (result?.success) {
        setBackupResult(result.error || t("backupUploaded"))
      } else {
        setBackupResult(result?.error || t("failedToSave"))
      }
    } catch {
      setBackupResult(t("failedToSave"))
    } finally {
      setBackingUpNow(false)
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      // Save via tRPC settings update
      const response = await fetch("/api/trpc/settings.update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backup_frequency: frequency,
          backup_retention: retention,
        }),
      })
    } catch {}
    setSavingSettings(false)
  }

  const t = useTranslations("settings")

  const displayResult = backupResult ?? (justConnected ? t("googleDriveConnected") : null)

  return (
    <div className="flex flex-col gap-6">
      {/* Manual backup */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("backup")}</h1>
        <p className="text-sm text-muted-foreground">{t("backupDesc")}</p>
        <Button onClick={handleDownload} disabled={downloading} className="w-fit">
          {downloading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {t("generatingBackup")}</>
          ) : (
            <><Package className="h-4 w-4" /> {t("downloadBackup")}</>
          )}
        </Button>
      </div>

      <hr />

      {/* Google Drive auto backup */}
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">{t("autoBackup")}</h2>

        {!googleSaved && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("googleDriveNotConfigured")}
              </p>
              <div>
                <label className="text-xs text-muted-foreground">{t("clientId")}</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-xs mt-1"
                  placeholder="123456789.apps.googleusercontent.com"
                  autoComplete="off"
                  data-form-type="other"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("clientSecret")}</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-background font-mono text-xs mt-1"
                  placeholder="GOCSPX-..."
                  autoComplete="off"
                  data-form-type="other"
                />
              </div>
              <Button
                size="sm"
                disabled={savingGoogle || !clientId || !clientSecret}
                onClick={async () => {
                  setSavingGoogle(true)
                  try {
                    await fetch("/api/settings/google-drive", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ clientId, clientSecret }),
                    })
                    setGoogleSaved(true)
                    window.location.reload()
                  } catch {}
                  setSavingGoogle(false)
                }}
              >
                {savingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("saveContinue")}
              </Button>
            </CardContent>
          </Card>
        )}

        {googleSaved && !isGoogleDriveConnected && googleAuthUrl && (
          <Card>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CloudOff className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{t("googleDriveNotConnected")}</p>
                  <p className="text-xs text-muted-foreground">{t("connectToEnable")}</p>
                </div>
              </div>
              <Button asChild size="sm">
                <a href={googleAuthUrl}>
                  <Cloud className="h-4 w-4" /> {t("connectGoogleDrive")}
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {oauthError && (
          <p className="text-sm text-red-600">{t("failedToSave")}</p>
        )}

        {isGoogleDriveConnected && (
          <>
            <Card>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cloud className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-sm">{t("googleDriveConnected")}</p>
                    <p className="text-xs text-muted-foreground">
                      {lastBackupAt
                        ? `${t("lastBackup")}: ${new Date(lastBackupAt).toLocaleString()}`
                        : t("noBackupsYet")}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleBackupNow} disabled={backingUpNow}>
                  {backingUpNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  {t("backupNow")}
                </Button>
              </CardContent>
            </Card>

            {displayResult && (
              <p className="text-sm text-green-600">
                {displayResult}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t("frequency")}</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-background mt-1"
                >
                  <option value="daily">{t("daily")}</option>
                  <option value="weekly">{t("weekly")}</option>
                  <option value="manual">{t("manualOnly")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("keepLastN")}</label>
                <select
                  value={retention}
                  onChange={(e) => setRetention(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-background mt-1"
                >
                  <option value="3">3</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={handleSaveSettings} disabled={savingSettings} className="w-fit">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("saveSettings")}
            </Button>
          </>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground p-4 bg-muted rounded-lg space-y-1">
        <p className="font-medium">{t("whatsIncluded")}</p>
        <ul className="list-disc list-inside">
          <li>{t("backupIncludes1")}</li>
          <li>{t("backupIncludes2")}</li>
          <li>{t("backupIncludes3")}</li>
        </ul>
        <p className="pt-2">{t("restoreHint")}</p>
        {isGoogleDriveConnected && (
          <p>
            Auto backups run via <code className="bg-background px-1 rounded">GET /api/cron/backup</code> —
            set up an external cron job or use Docker healthcheck to trigger it.
          </p>
        )}
      </div>
    </div>
  )
}
