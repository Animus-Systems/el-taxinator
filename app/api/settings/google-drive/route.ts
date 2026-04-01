import { getCurrentUser } from "@/lib/auth"
import { updateSettings } from "@/models/settings"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  const { clientId, clientSecret } = await request.json()

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Both Client ID and Client Secret are required" }, { status: 400 })
  }

  await updateSettings(user.id, "google_drive_client_id", clientId)
  await updateSettings(user.id, "google_drive_client_secret", clientSecret)

  return NextResponse.json({ success: true })
}
