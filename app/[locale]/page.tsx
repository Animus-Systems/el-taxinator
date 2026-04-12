import { redirect } from "next/navigation"
import { isConnected } from "@/lib/auth"
import { ENTITY_COOKIE, shutdownRunningEntitySession } from "@/lib/entities"
import { cookies } from "next/headers"

export default async function LocaleRootPage() {
  if (await isConnected()) {
    redirect("/dashboard")
  }

  const cookieStore = await cookies()
  if (!cookieStore.get(ENTITY_COOKIE)?.value) {
    await shutdownRunningEntitySession()
  }

  redirect("/")
}

export const dynamic = "force-dynamic"
