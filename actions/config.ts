"use server"

import type { EntityType } from "@/lib/entities"
import { saveAppConfig, getDataRoot } from "@/lib/embedded-pg"
import { revalidatePath } from "next/cache"

export async function getDataLocationAction() {
  return { dataDir: getDataRoot() }
}

export async function updateDataLocationAction(dataDir: string) {
  const path = await import("path")
  const fs = await import("fs")

  const resolved = path.resolve(dataDir)

  // Ensure the directory exists or can be created
  try {
    fs.mkdirSync(resolved, { recursive: true })
  } catch (error) {
    return {
      success: false,
      error:
        "Cannot create directory: " +
        (error instanceof Error ? error.message : "Unknown error"),
    }
  }

  saveAppConfig({ dataDir: resolved })
  revalidatePath("/", "layout")

  // Restart to use new data location
  setTimeout(() => process.exit(0), 2000)

  return { success: true }
}

export async function scanForProfilesAction(dataDir: string) {
  const pathMod = await import("path")
  const fs = await import("fs")
  const resolved = pathMod.resolve(dataDir)

  if (!fs.existsSync(resolved)) {
    return { profiles: [] as { id: string; hasDb: boolean }[] }
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true })
  const profiles: { id: string; hasDb: boolean }[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Skip non-profile directories
    if (entry.name === "pgdata" || entry.name.startsWith(".")) continue
    const pgdataPath = pathMod.join(resolved, entry.name, "pgdata")
    if (fs.existsSync(pathMod.join(pgdataPath, "PG_VERSION"))) {
      profiles.push({ id: entry.name, hasDb: true })
    }
  }

  return { profiles }
}

export async function adoptProfilesAction(
  dataDir: string,
  profiles: { id: string; type: EntityType }[],
) {
  const pathMod = await import("path")
  const { addEntity, getEntities } = await import("@/lib/entities")

  const resolved = pathMod.resolve(dataDir)

  // Register each profile as an entity, storing its data path
  for (const profile of profiles) {
    const existing = getEntities()
    if (!existing.some((e) => e.id === profile.id)) {
      addEntity({
        id: profile.id,
        name: profile.id.replace(/_/g, " "),
        type: profile.type,
        dataDir: pathMod.join(resolved, profile.id),
      })
    }
  }

  return { success: true, count: profiles.length }
}
