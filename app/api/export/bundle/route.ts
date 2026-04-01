import { getCurrentUser } from "@/lib/auth"
import { getActiveEntity } from "@/lib/entities"
import { createBundle } from "@/lib/bundle"
import { NextResponse } from "next/server"

export async function GET() {
  const user = await getCurrentUser()
  const entity = await getActiveEntity()

  try {
    const zipBuffer = await createBundle(entity, user)

    const slug = entity.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()
    const filename = `${slug}.taxinator.zip`

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.length),
      },
    })
  } catch (error) {
    console.error("Bundle export failed:", error)
    return NextResponse.json({ error: "Failed to create backup. Is pg_dump installed?" }, { status: 500 })
  }
}
