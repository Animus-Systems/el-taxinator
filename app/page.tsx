import { EntityPicker } from "@/components/auth/entity-picker"
import { getEntities } from "@/lib/entities"
import { isConnected } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function Home({ searchParams }: { searchParams: Promise<{ switch?: string }> }) {
  const params = await searchParams
  const isSwitching = params.switch === "1"

  // If already connected and not explicitly switching, go to dashboard
  if (!isSwitching && await isConnected()) {
    redirect("/dashboard")
  }

  const entities = getEntities()

  return <EntityPicker entities={entities} />
}

export const dynamic = "force-dynamic"
