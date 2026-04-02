import { redirect } from "next/navigation"
import { isConnected } from "@/lib/auth"

export default async function LocaleRootPage() {
  if (await isConnected()) {
    redirect("/dashboard")
  }
  redirect("/")
}

export const dynamic = "force-dynamic"
