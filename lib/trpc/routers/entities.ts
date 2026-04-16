import { z } from "zod"
import { router, publicProcedure } from "../init"
import fs from "fs"
import path from "path"
import os from "os"
import {
  getEntities,
  getEntityById,
  addEntity,
  removeEntity,
  updateEntity,
  closePoolForEntity,
  getActiveEntityIdFromFile,
  setActiveEntity,
  clearActiveEntityFile,
  resolveEntityDir,
} from "@/lib/entities"
import {
  startCluster,
  stopCluster,
  initNewCluster,
  getRunningClusterEntityId,
  getEntityDataDir,
  getDataRoot,
} from "@/lib/embedded-pg"
import { ensureSchema } from "@/lib/schema"
import { codeFromName, folderNameFromName } from "@/lib/utils"
import { getOrCreateSelfHostedUser } from "@/models/users"

const entitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["autonomo", "sl"]),
  db: z.string().optional(),
  dataDir: z.string().optional(),
})

export const entitiesRouter = router({
  list: publicProcedure
    .output(z.array(entitySchema))
    .query(() => getEntities()),

  getActive: publicProcedure
    .output(z.string())
    .query(() => getActiveEntityIdFromFile()),

  connect: publicProcedure
    .input(z.object({ entityId: z.string() }))
    .output(z.object({ success: z.boolean(), error: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
        const entity = getEntityById(input.entityId)
        if (!entity) {
          return { success: false, error: `Entity "${input.entityId}" not found` }
        }

        // Stop the current cluster if it's running for a different entity
        const running = getRunningClusterEntityId()
        if (running && running !== input.entityId) {
          await closePoolForEntity(running)
          await stopCluster()
        }

        // Start the cluster (or connect to external DB)
        if (!entity.db) {
          await startCluster(input.entityId, entity.dataDir)
        }

        // Ensure schema is applied
        const { getPoolForEntity } = await import("@/lib/entities")
        const pool = await getPoolForEntity(input.entityId)
        await ensureSchema(pool)

        // Persist active entity before bootstrapping the self-hosted user so
        // downstream model helpers resolve the correct entity pool.
        await setActiveEntity(input.entityId)
        await getOrCreateSelfHostedUser()

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to connect",
        }
      }
    }),

  disconnect: publicProcedure
    .output(z.object({ success: z.boolean(), error: z.string().optional() }))
    .mutation(async () => {
      try {
        const activeId = getActiveEntityIdFromFile()
        if (activeId) {
          const running = getRunningClusterEntityId()
          if (running === activeId) {
            await closePoolForEntity(activeId)
            await stopCluster()
          }
        }
        clearActiveEntityFile()
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to disconnect",
        }
      }
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["autonomo", "sl"]),
        dataDir: z.string().optional(),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        entityId: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const entityId = codeFromName(input.name)
        const folderName = folderNameFromName(input.name)

        const baseDir = input.dataDir
          ? `${input.dataDir}/${folderName}`
          : getEntityDataDir(entityId)

        // Init the embedded Postgres cluster
        await initNewCluster(entityId, baseDir)

        // Create uploads directory
        fs.mkdirSync(`${baseDir}/uploads`, { recursive: true })

        // Register the entity
        addEntity({
          id: entityId,
          name: input.name,
          type: input.type,
          dataDir: baseDir,
        })

        // Connect and ensure schema
        const { getPoolForEntity } = await import("@/lib/entities")
        const pool = await getPoolForEntity(entityId)
        await ensureSchema(pool)
        await setActiveEntity(entityId)
        await getOrCreateSelfHostedUser()

        return { success: true, entityId }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create entity",
        }
      }
    }),

  update: publicProcedure
    .input(
      z.object({
        entityId: z.string(),
        name: z.string().optional(),
        type: z.enum(["autonomo", "sl"]).optional(),
        db: z.string().optional(),
      }),
    )
    .output(z.object({ success: z.boolean(), error: z.string().optional() }))
    .mutation(({ input }) => {
      try {
        const { entityId, name, type, db } = input
        updateEntity(entityId, {
          ...(name !== undefined && { name }),
          ...(type !== undefined && { type }),
          ...(db !== undefined && { db }),
        })
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update entity",
        }
      }
    }),

  listDirectories: publicProcedure
    .input(z.object({ path: z.string() }))
    .output(z.object({
      current: z.string(),
      directories: z.array(z.string()),
      parent: z.string().nullable(),
      shortcuts: z.array(z.object({ name: z.string(), path: z.string() })),
    }))
    .query(({ input }) => {
      let dirPath = input.path || os.homedir()

      // Resolve ~ to home directory
      if (dirPath.startsWith("~")) {
        dirPath = dirPath.replace("~", os.homedir())
      }

      // Ensure path exists and is a directory
      try {
        const stat = fs.statSync(dirPath)
        if (!stat.isDirectory()) dirPath = path.dirname(dirPath)
      } catch {
        dirPath = os.homedir()
      }

      // List subdirectories (including hidden/dot folders)
      let directories: string[] = []
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        directories = entries
          .filter((e) => {
            try {
              return e.isDirectory() || e.isSymbolicLink()
            } catch {
              return false
            }
          })
          .map((e) => e.name)
          .sort((a, b) => {
            // Hidden folders last, then alphabetical
            const aHidden = a.startsWith(".")
            const bHidden = b.startsWith(".")
            if (aHidden !== bHidden) return aHidden ? 1 : -1
            return a.localeCompare(b)
          })
      } catch {
        directories = []
      }

      // Parent directory
      const parent = dirPath === "/" ? null : path.dirname(dirPath)

      // Shortcuts — include common macOS/Linux locations
      const home = os.homedir()
      const shortcuts: { name: string; path: string }[] = [
        { name: "Home", path: home },
        { name: "Desktop", path: path.join(home, "Desktop") },
        { name: "Documents", path: path.join(home, "Documents") },
      ]

      // macOS: add iCloud, Google Drive, Dropbox if they exist
      const cloudPaths = [
        { name: "iCloud Drive", path: path.join(home, "Library/Mobile Documents/com~apple~CloudDocs") },
        { name: "Google Drive", path: path.join(home, "Library/CloudStorage") },
        { name: "Dropbox", path: path.join(home, "Dropbox") },
        { name: "OneDrive", path: path.join(home, "OneDrive") },
      ]
      for (const cp of cloudPaths) {
        try {
          if (fs.existsSync(cp.path) && fs.statSync(cp.path).isDirectory()) {
            shortcuts.push(cp)
          }
        } catch {}
      }

      return { current: dirPath, directories, parent, shortcuts }
    }),

  scanForProfiles: publicProcedure
    .input(z.object({ path: z.string() }))
    .output(z.object({
      profiles: z.array(z.object({ name: z.string(), path: z.string() })),
    }))
    .query(({ input }) => {
      const profiles: { name: string; path: string }[] = []
      try {
        const entries = fs.readdirSync(input.path, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const pgVersionPath = path.join(input.path, entry.name, "pgdata", "PG_VERSION")
          if (fs.existsSync(pgVersionPath)) {
            profiles.push({ name: entry.name, path: path.join(input.path, entry.name) })
          }
        }
      } catch {}
      return { profiles }
    }),

  getDataRoot: publicProcedure
    .output(z.object({ dataDir: z.string() }))
    .query(() => {
      return { dataDir: getDataRoot() }
    }),

  adoptProfiles: publicProcedure
    .input(z.object({
      scanDir: z.string(),
      profiles: z.array(z.object({
        id: z.string(),
        type: z.enum(["autonomo", "sl"]),
      })),
    }))
    .output(z.object({ success: z.boolean(), adopted: z.number(), error: z.string().optional() }))
    .mutation(async ({ input }) => {
      let adopted = 0
      try {
        const existing = getEntities()
        const existingIds = new Set(existing.map(e => e.id))

        for (const p of input.profiles) {
          if (existingIds.has(p.id)) continue // skip already registered
          const profileDir = path.join(input.scanDir, p.id)
          const displayName = p.id.replace(/_/g, " ")
          addEntity({
            id: p.id,
            name: displayName,
            type: p.type,
            dataDir: profileDir,
          })
          adopted++
        }
        return { success: true, adopted }
      } catch (error) {
        return {
          success: false,
          adopted,
          error: error instanceof Error ? error.message : "Failed to adopt profiles",
        }
      }
    }),

  remove: publicProcedure
    .input(
      z.object({
        entityId: z.string(),
        deleteData: z.boolean().default(false),
      }),
    )
    .output(z.object({ success: z.boolean(), error: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
        const entity = getEntityById(input.entityId)
        if (!entity) {
          return { success: false, error: `Entity "${input.entityId}" not found` }
        }

        // Stop cluster if running for this entity
        const running = getRunningClusterEntityId()
        if (running === input.entityId) {
          await closePoolForEntity(input.entityId)
          await stopCluster()
          clearActiveEntityFile()
        } else {
          await closePoolForEntity(input.entityId)
        }

        // Remove from registry
        removeEntity(input.entityId)

        // Optionally delete data directory (only for embedded, not external DB)
        if (input.deleteData && !entity.db) {
          const dataDir = resolveEntityDir(input.entityId)
          if (dataDir) {
            fs.rmSync(dataDir, { recursive: true, force: true })
          }
        }

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to remove entity",
        }
      }
    }),
})
