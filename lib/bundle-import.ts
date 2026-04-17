import { execFileSync } from "child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import JSZip from "jszip"

import type { EntityType } from "@/lib/entities"
import {
  addEntity,
  closeAllPools,
  getActiveEntityIdFromFile,
  getEntities,
  getEntityById,
  getPoolForEntity,
  removeEntity,
  setActiveEntity,
} from "@/lib/entities"
import {
  buildConnectionString,
  getEntityDataDir,
  initNewCluster,
  startCluster,
  stopCluster,
} from "@/lib/embedded-pg"
import { getUserUploadsDirectory, safePathJoin } from "@/lib/files"
import { ensureSchema } from "@/lib/schema"
import { forgetSharedIncomeSourcesForEntity, recordSharedIncomeSource } from "@/lib/shared-income-sources"
import { codeFromName } from "@/lib/utils"
import { listIncomeSources } from "@/models/income-sources"
import { getOrCreateSelfHostedUser } from "@/models/users"

const bundleManifestSchema = z.object({
  version: z.string(),
  entity: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["autonomo", "sl", "individual"]),
  }),
  created: z.string(),
  dbDumpFile: z.string(),
})

export type BundleManifest = z.infer<typeof bundleManifestSchema>

function normalizeEntityType(value: string | undefined, fallback: EntityType): EntityType {
  return value === "autonomo" || value === "sl" || value === "individual" ? value : fallback
}

function resolveImportIdentity(preferredName: string): {
  entityId: string
  entityName: string
  dataDir: string
} {
  const baseName = preferredName.trim() || "Imported Company"
  const existingIds = new Set(getEntities().map((entity) => entity.id))

  for (let suffix = 1; suffix < 1000; suffix++) {
    const candidateName = suffix === 1 ? baseName : `${baseName} (${suffix})`
    const candidateId = codeFromName(candidateName) || `imported_company_${suffix}`
    const candidateDir = getEntityDataDir(candidateId)
    if (!existingIds.has(candidateId) && !fs.existsSync(candidateDir)) {
      return {
        entityId: candidateId,
        entityName: candidateName,
        dataDir: candidateDir,
      }
    }
  }

  throw new Error("Could not find a free entity id for the imported bundle")
}

function extractExecError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown restore error"

  const stderr = error instanceof Error && "stderr" in error
    ? (error as Error & { stderr?: Buffer | string }).stderr
    : undefined

  if (typeof stderr === "string" && stderr.trim().length > 0) {
    return stderr.trim()
  }
  if (stderr instanceof Buffer && stderr.length > 0) {
    return stderr.toString("utf-8").trim()
  }

  return error.message
}

async function loadBundle(buffer: Buffer): Promise<JSZip> {
  return JSZip.loadAsync(buffer)
}

async function parseManifest(zip: JSZip): Promise<BundleManifest> {
  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) {
    throw new Error("Bundle is missing manifest.json")
  }

  const raw = await manifestFile.async("string")
  const parsed = JSON.parse(raw) as unknown
  return bundleManifestSchema.parse(parsed)
}

function restoreDatabase(connectionString: string, sqlDump: string): void {
  try {
    execFileSync(
      "psql",
      ["--single-transaction", "--set", "ON_ERROR_STOP=1", connectionString],
      {
        input: sqlDump,
        encoding: "utf-8",
        maxBuffer: 500 * 1024 * 1024,
        timeout: 120_000,
      },
    )
  } catch (error) {
    throw new Error(`Database restore failed: ${extractExecError(error)}`)
  }
}

async function restoreUploads(zip: JSZip, entityId: string): Promise<void> {
  const uploadsDir = getUserUploadsDirectory(entityId)
  await fsp.mkdir(uploadsDir, { recursive: true })

  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith("uploads/")) continue

    const relativePath = entry.name.slice("uploads/".length)
    if (!relativePath) continue

    const absolutePath = safePathJoin(uploadsDir, relativePath)
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true })
    await fsp.writeFile(absolutePath, await entry.async("nodebuffer"))
  }
}

async function syncSharedIncomeSources(entityId: string, entityName: string, userId: string): Promise<void> {
  forgetSharedIncomeSourcesForEntity(entityId)

  const incomeSources = await listIncomeSources(userId)
  for (const source of incomeSources) {
    recordSharedIncomeSource({
      entityId,
      entityName,
      id: source.id,
      kind: source.kind,
      name: source.name,
      taxId: source.taxId,
      metadata: source.metadata,
      updatedAt: source.updatedAt.toISOString(),
    })
  }
}

export async function readBundleManifest(buffer: Buffer): Promise<BundleManifest> {
  const zip = await loadBundle(buffer)
  return parseManifest(zip)
}

export async function importBundleFromBuffer(
  buffer: Buffer,
  options?: {
    entityName?: string
    entityType?: string
  },
): Promise<{
  entityId: string
  entityName: string
  manifest: BundleManifest
}> {
  const zip = await loadBundle(buffer)
  const manifest = await parseManifest(zip)
  const sqlFile = zip.file(manifest.dbDumpFile) ?? zip.file("database.sql")
  if (!sqlFile) {
    throw new Error(`Bundle is missing ${manifest.dbDumpFile}`)
  }

  const sqlDump = await sqlFile.async("string")
  const entityType = normalizeEntityType(options?.entityType, manifest.entity.type)
  const preferredName = options?.entityName?.trim() || manifest.entity.name
  const { entityId, entityName, dataDir } = resolveImportIdentity(preferredName)

  const previousActiveEntity = getEntityById(getActiveEntityIdFromFile())
  let entityRegistered = false
  let startedCluster = false

  try {
    await closeAllPools()
    await initNewCluster(entityId, dataDir)

    const info = await startCluster(entityId, dataDir)
    startedCluster = true

    restoreDatabase(buildConnectionString(info, "taxinator"), sqlDump)
    await restoreUploads(zip, entityId)

    addEntity({
      id: entityId,
      name: entityName,
      type: entityType,
      dataDir,
    })
    entityRegistered = true

    const pool = await getPoolForEntity(entityId)
    await ensureSchema(pool)
    await setActiveEntity(entityId)

    const user = await getOrCreateSelfHostedUser()
    await syncSharedIncomeSources(entityId, entityName, user.id)

    return { entityId, entityName, manifest }
  } catch (error) {
    if (entityRegistered) {
      try {
        removeEntity(entityId)
      } catch {}
    }

    forgetSharedIncomeSourcesForEntity(entityId)

    if (startedCluster) {
      try {
        await closeAllPools()
        await stopCluster()
      } catch {}
    }

    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
    } catch {}

    if (previousActiveEntity && !previousActiveEntity.db) {
      try {
        await startCluster(previousActiveEntity.id, previousActiveEntity.dataDir)
      } catch {}
    }

    throw error
  }
}
