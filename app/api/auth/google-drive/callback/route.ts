import { getCurrentUser } from "@/lib/auth"
import { getTokensFromCode } from "@/lib/google-drive"
import { getSettings, updateSettings } from "@/models/settings"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(new URL("/settings/backups?error=no_code", request.url))
  }

  try {
    const user = await getCurrentUser()
    const settings = await getSettings(user.id)
    const tokens = await getTokensFromCode(code, settings)

    if (tokens.refresh_token) {
      await updateSettings(user.id, "google_drive_refresh_token", tokens.refresh_token)
    }

    return NextResponse.redirect(new URL("/settings/backups?gdrive=connected", request.url))
  } catch (error) {
    console.error("Google Drive OAuth error:", error)
    return NextResponse.redirect(new URL("/settings/backups?error=oauth_failed", request.url))
  }
}
