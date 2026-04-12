# Per-Profile Data Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each entity/profile gets its own self-contained folder (`data/<entityId>/`) with an independent Postgres cluster, runtime config, and uploads. Only one cluster runs at a time. Switching profiles restarts the server.

**Architecture:** Replace the shared cluster model with per-profile clusters. `startCluster(entityId)` boots a cluster from `data/<entityId>/pgdata/`. `getUserUploadsDirectory()` resolves to `data/<entityId>/uploads/`. `switchEntityAction()` calls `process.exit(0)` so Next.js restarts with the new profile's cluster. Remove `ensureDatabase()` — each cluster has one fixed DB named `taxinator`.

**Tech Stack:** Node.js, PostgreSQL 17 (embedded-postgres), Next.js 16, pg driver

**Spec:** `docs/superpowers/specs/2026-04-12-per-profile-data-isolation-design.md`

---

### Task 1: Refactor `lib/embedded-pg.ts` — per-profile cluster paths

The core change: `startCluster` takes an `entityId` and uses `data/<entityId>/pgdata/` + `data/<entityId>/runtime.json` instead of the shared `data/pgdata/` + `data/runtime.json`. Remove `ensureDatabase()` since each cluster serves one fixed DB.

**Files:**
- Modify: `lib/embedded-pg.ts`

- [ ] **Step 1: Update path helpers to accept entityId**

Replace the three path helper functions and add `getDataRoot`:

```typescript
// In lib/embedded-pg.ts — replace lines 35-45

const CONFIG_FILE = "taxinator.config.json"

type AppConfig = {
  dataDir?: string
}

function loadAppConfig(): AppConfig {
  const filePath = path.join(process.cwd(), CONFIG_FILE)
  try {
    if (!fs.existsSync(filePath)) return {}
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as AppConfig
  } catch {
    return {}
  }
}

export function saveAppConfig(config: AppConfig): void {
  const filePath = path.join(process.cwd(), CONFIG_FILE)
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8")
}

export function getDataRoot(): string {
  const fromConfig = loadAppConfig().dataDir
  const resolved = fromConfig ?? process.env.TAXINATOR_DATA_DIR ?? path.join(process.cwd(), "data")
  return path.resolve(resolved)
}

export function getEntityDataDir(entityId: string): string {
  return path.join(getDataRoot(), entityId)
}

function getPgDataDir(entityId: string): string {
  return path.join(getEntityDataDir(entityId), "pgdata")
}

function getRuntimeFilePath(entityId: string): string {
  return path.join(getEntityDataDir(entityId), RUNTIME_FILE)
}
```

- [ ] **Step 2: Update `loadRuntimeConfig` and `saveRuntimeConfig` to accept entityId**

```typescript
// Replace loadRuntimeConfig (around line 78)
function loadRuntimeConfig(entityId: string): RuntimeConfig | null {
  const filePath = getRuntimeFilePath(entityId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as RuntimeConfig
    if (!parsed.port || !parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

// Replace saveRuntimeConfig (around line 91)
function saveRuntimeConfig(entityId: string, config: RuntimeConfig): void {
  const filePath = getRuntimeFilePath(entityId)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8")
}
```

- [ ] **Step 3: Update `ClusterState` — remove `ensuredDatabases`**

```typescript
// Replace ClusterState type (around line 115)
type ClusterState = {
  pg: EmbeddedPostgres
  info: ClusterInfo
  entityId: string
}
```

- [ ] **Step 4: Rewrite `startCluster(entityId)`**

```typescript
// Replace the entire startCluster function (around line 126)
export async function startCluster(entityId: string): Promise<ClusterInfo> {
  if (globalForCluster.__taxinatorEmbeddedCluster) {
    if (globalForCluster.__taxinatorEmbeddedCluster.entityId === entityId) {
      return globalForCluster.__taxinatorEmbeddedCluster.info
    }
    // Different entity requested — stop the current cluster first
    await stopCluster()
  }
  if (globalForCluster.__taxinatorEmbeddedClusterStarting) {
    const state = await globalForCluster.__taxinatorEmbeddedClusterStarting
    return state.info
  }

  globalForCluster.__taxinatorEmbeddedClusterStarting = (async () => {
    const dataDir = getPgDataDir(entityId)
    const initialised = isAlreadyInitialised(dataDir)

    const existing = loadRuntimeConfig(entityId)
    let port: number
    let password: string

    if (existing && !(await isPortInUse(existing.port))) {
      port = existing.port
      password = existing.password
    } else {
      port = await pickFreePort()
      password = existing?.password ?? randomUUID().replace(/-/g, "")
      saveRuntimeConfig(entityId, { port, password })
    }

    const instance = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: SUPERUSER,
      password,
      port,
      persistent: true,
    })

    if (!initialised) {
      console.log(`[embedded-pg] Initialising new cluster for "${entityId}" at ${dataDir}`)
      await instance.initialise()
    }

    console.log(`[embedded-pg] Starting cluster for "${entityId}" on 127.0.0.1:${port}`)
    await instance.start()

    const info: ClusterInfo = {
      host: "127.0.0.1",
      port,
      user: SUPERUSER,
      password,
      dataDir,
    }

    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = buildConnectionString(info, DB_NAME)
    }

    const state: ClusterState = {
      pg: instance,
      info,
      entityId,
    }

    registerShutdownHooks(state)

    globalForCluster.__taxinatorEmbeddedCluster = state
    return state
  })().finally(() => {
    globalForCluster.__taxinatorEmbeddedClusterStarting = undefined
  })

  const state = await globalForCluster.__taxinatorEmbeddedClusterStarting
  return state.info
}
```

- [ ] **Step 5: Add fixed DB_NAME constant, update `getEmbeddedConnectionString`, remove `ensureDatabase`**

```typescript
// Add after SUPERUSER constant (line 32)
const DB_NAME = "taxinator"

// Replace getEmbeddedConnectionString (around line 221)
export function getEmbeddedConnectionString(): string {
  const info = getClusterInfo()
  if (!info) {
    throw new Error("Embedded Postgres cluster has not been started")
  }
  return buildConnectionString(info, DB_NAME)
}

// Delete the entire ensureDatabase function (lines 234-266)
```

- [ ] **Step 6: Add `initNewCluster` for entity creation**

```typescript
// Add after stopCluster function (before shutdown hooks)

/**
 * Initialise a fresh Postgres cluster for a new entity. Creates the
 * data directory, runs initdb, then stops the temporary instance.
 * The cluster is NOT left running — call startCluster(entityId) to use it.
 */
export async function initNewCluster(entityId: string): Promise<void> {
  const dataDir = getPgDataDir(entityId)

  if (isAlreadyInitialised(dataDir)) {
    console.log(`[embedded-pg] Cluster for "${entityId}" already initialised`)
    return
  }

  const port = await pickFreePort()
  const password = randomUUID().replace(/-/g, "")

  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: SUPERUSER,
    password,
    port,
    persistent: true,
  })

  console.log(`[embedded-pg] Initialising new cluster for "${entityId}" at ${dataDir}`)
  await instance.initialise()

  saveRuntimeConfig(entityId, { port, password })
  console.log(`[embedded-pg] Cluster for "${entityId}" initialised (not started)`)
}
```

- [ ] **Step 7: Verify exports**

`getDataRoot`, `getEntityDataDir`, `saveAppConfig` are already exported from Step 1. `initNewCluster` from Step 6. Confirm no missing exports.

- [ ] **Step 8: Verify the file compiles**

Run: `npx tsc --noEmit lib/embedded-pg.ts 2>&1 | head -20`

This will likely show errors in files that import `ensureDatabase` — that's expected and fixed in Task 2.

- [ ] **Step 9: Commit**

```bash
git add lib/embedded-pg.ts
git commit -m "refactor: per-profile Postgres clusters in embedded-pg

Each entity gets its own pgdata/ and runtime.json under data/<entityId>/.
startCluster() now takes an entityId parameter. ensureDatabase() removed
since each cluster has a single fixed DB name."
```

---

### Task 2: Refactor `lib/entities.ts` — simplify pool management

The pool logic simplifies: only one embedded cluster runs at a time, so there's effectively one pool for embedded entities. `resolveConnectionString` no longer calls `ensureDatabase`. `getPoolForEntity` only works for the active entity (embedded) or any external entity.

**Files:**
- Modify: `lib/entities.ts`

- [ ] **Step 1: Update imports — remove `ensureDatabase`**

```typescript
// Replace the imports from embedded-pg (line 6-10)
import {
  startCluster,
  getClusterInfo,
  getEmbeddedConnectionString,
  getEntityDataDir,
} from "./embedded-pg"
```

- [ ] **Step 2: Remove `dataDir` from Entity type**

The `dataDir` field is no longer needed — the entity ID determines the path. Remove it from the type:

```typescript
export type Entity = {
  id: string
  name: string
  type: EntityType
  /**
   * Postgres connection string. Optional: when omitted, the entity uses its
   * own cluster under data/<id>/. Set this only when pointing at an external
   * Postgres for advanced/dev scenarios.
   */
  db?: string
}
```

- [ ] **Step 3: Simplify `resolveConnectionString`**

```typescript
// Replace resolveConnectionString (around line 195)
async function resolveConnectionString(entity: Entity): Promise<string> {
  if (entity.db && entity.db.length > 0) {
    return entity.db
  }

  // Embedded path: cluster should already be running for the active entity
  if (!getClusterInfo()) {
    await startCluster(entity.id)
  }
  return getEmbeddedConnectionString()
}
```

- [ ] **Step 4: Verify the file compiles (expect downstream errors)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` to count remaining errors.

Errors in files referencing `entity.dataDir` are expected — fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add lib/entities.ts
git commit -m "refactor: simplify entity pool management

Remove dataDir from Entity type — entity ID determines the path.
resolveConnectionString no longer calls ensureDatabase."
```

---

### Task 3: Refactor `lib/files.ts` — uploads path from entity ID

`getUserUploadsDirectory` now resolves to `data/<entityId>/uploads/` via the entity ID. No more email-based fallback. The function needs the active entity ID instead of the User object.

**Files:**
- Modify: `lib/files.ts`

- [ ] **Step 1: Replace `getUserUploadsDirectory` and dependent helpers**

```typescript
// Replace the top of lib/files.ts (lines 1-31)
import type { File, Transaction, User } from "@/lib/db-types"
import { getEntityDataDir } from "@/lib/embedded-pg"
import { access, constants, readdir, stat } from "fs/promises"
import path from "path"
import config from "./config"

export const FILE_UNSORTED_DIRECTORY_NAME = "unsorted"
export const FILE_PREVIEWS_DIRECTORY_NAME = "previews"
export const FILE_STATIC_DIRECTORY_NAME = "static"
export const FILE_IMPORT_CSV_DIRECTORY_NAME = "csv"

/**
 * Get uploads directory for an entity.
 * Resolves to `data/<entityId>/uploads/`.
 */
export function getUserUploadsDirectory(entityId: string): string {
  return path.join(getEntityDataDir(entityId), "uploads")
}

export function getStaticDirectory(entityId: string): string {
  return safePathJoin(getUserUploadsDirectory(entityId), FILE_STATIC_DIRECTORY_NAME)
}

export function getUserPreviewsDirectory(entityId: string): string {
  return safePathJoin(getUserUploadsDirectory(entityId), FILE_PREVIEWS_DIRECTORY_NAME)
}
```

- [ ] **Step 2: Update `fullPathForFile`**

```typescript
// Replace fullPathForFile (around line 48)
export function fullPathForFile(entityId: string, file: File): string {
  const uploadsDirectory = getUserUploadsDirectory(entityId)
  return safePathJoin(uploadsDirectory, file.path)
}
```

- [ ] **Step 3: Remove `FILE_UPLOAD_PATH` export and `Entity` import**

The old `FILE_UPLOAD_PATH` constant and `Entity` import are no longer used. Remove them. The `User` import is still used by `isEnoughStorageToUploadFile`.

- [ ] **Step 4: Verify file compiles in isolation**

Run: `npx tsc --noEmit 2>&1 | grep "lib/files.ts" | head -5`

Should show no errors in `lib/files.ts` itself. Downstream callers will error — fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add lib/files.ts
git commit -m "refactor: uploads path derived from entity ID

getUserUploadsDirectory(entityId) resolves to data/<entityId>/uploads/.
Remove email-based fallback and FILE_UPLOAD_PATH constant."
```

---

### Task 4: Update all callers of `getUserUploadsDirectory` and `fullPathForFile`

Every file that calls these functions needs to pass `entityId` instead of `user`/`entity`. The active entity ID is available via `getActiveEntityId()` (async) in server contexts.

**Files:**
- Modify: `actions/transactions.ts`
- Modify: `actions/unsorted.ts`
- Modify: `actions/files.ts`
- Modify: `actions/bundle.ts`
- Modify: `lib/bundle.ts`
- Modify: `models/files.ts`
- Modify: `ai/attachments.ts`
- Modify: `app/[locale]/(app)/apps/invoices/actions.ts`
- Modify: `app/[locale]/(app)/settings/backups/actions.ts`
- Modify: `app/[locale]/(app)/settings/backups/data/route.ts`
- Modify: `app/[locale]/(app)/files/preview/[fileId]/route.ts`
- Modify: `app/[locale]/(app)/files/download/[fileId]/route.ts`
- Modify: `app/[locale]/(app)/export/transactions/route.ts`
- Modify: `app/api/export/accountant/route.ts`

The pattern is the same for every file:

1. Add `import { getActiveEntityId } from "@/lib/entities"` (if not already imported)
2. Get the entity ID: `const entityId = await getActiveEntityId()`
3. Replace `getUserUploadsDirectory(user)` → `getUserUploadsDirectory(entityId)`
4. Replace `getUserUploadsDirectory(user, entity)` → `getUserUploadsDirectory(entityId)`
5. Replace `fullPathForFile(user, file)` → `fullPathForFile(entityId, file)`
6. Replace `fullPathForFile(user, file, entity)` → `fullPathForFile(entityId, file)`
7. Replace `fullPathForFile(user as any, file as any)` → `fullPathForFile(entityId, file as any)`
8. Remove unused `Entity` import if it was only used for the entity parameter
9. Remove the `entity` parameter from `getUserUploadsDirectory` / `fullPathForFile` calls

- [ ] **Step 1: Update `actions/transactions.ts`**

Read the file, find every call to `getUserUploadsDirectory(user)`, add `entityId` acquisition at the top of each function that needs it, and replace the calls. The file has calls at lines 118, 140, 194. Each is inside a server action that already has `const user = ...`. Add `const entityId = await getActiveEntityId()` near the `user` line, then change the calls.

- [ ] **Step 2: Update `actions/unsorted.ts`**

Same pattern. Calls at lines 103, 166, 211, 244, 294. Each server action gets `entityId` added.

- [ ] **Step 3: Update `actions/files.ts`**

Calls at lines 24, 73. Add `entityId` to each action.

- [ ] **Step 4: Update `actions/bundle.ts`**

Call at line 145: `getUserUploadsDirectory(user, entity)` → `getUserUploadsDirectory(entityId)`. The function already has `entity` available, so use `entity.id` directly instead of calling `getActiveEntityId()`.

- [ ] **Step 5: Update `lib/bundle.ts`**

Call at line 60: `getUserUploadsDirectory(user, entity)` → `getUserUploadsDirectory(entity.id)`. This function receives `entity` as a parameter.

- [ ] **Step 6: Update `models/files.ts`**

Call at line 109: `fullPathForFile(user, file)` → `fullPathForFile(entityId, file)`. The `deleteFile` function needs `entityId`. Since this is a model function called from tRPC context, add `entityId` as a parameter to `deleteFile`.

- [ ] **Step 7: Update `ai/attachments.ts`**

Call at line 15: `fullPathForFile(user, file)` → `fullPathForFile(entityId, file)`. Add `entityId` parameter to the function that contains this call.

- [ ] **Step 8: Update `app/[locale]/(app)/apps/invoices/actions.ts`**

Call at line 93: `getUserUploadsDirectory(user)` → `getUserUploadsDirectory(entityId)`.

- [ ] **Step 9: Update `app/[locale]/(app)/settings/backups/actions.ts`**

Calls at lines 26 and 101: `getUserUploadsDirectory(user)` → `getUserUploadsDirectory(entityId)`.

- [ ] **Step 10: Update `app/[locale]/(app)/settings/backups/data/route.ts`**

Call at line 16: `getUserUploadsDirectory(user)` → `getUserUploadsDirectory(entityId)`.

- [ ] **Step 11: Update `app/[locale]/(app)/files/preview/[fileId]/route.ts`**

Call at line 30: `fullPathForFile(user, file)` → `fullPathForFile(entityId, file)`.

- [ ] **Step 12: Update `app/[locale]/(app)/files/download/[fileId]/route.ts`**

Call at line 25: `fullPathForFile(user, file)` → `fullPathForFile(entityId, file)`.

- [ ] **Step 13: Update `app/[locale]/(app)/export/transactions/route.ts`**

Call at line 134: `fullPathForFile(user, file)` → `fullPathForFile(entityId, file)`.

- [ ] **Step 14: Update `app/api/export/accountant/route.ts`**

Call at line 120: `fullPathForFile(user as any, file as any)` → `fullPathForFile(entityId, file as any)`.

- [ ] **Step 15: Type check**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: no errors (or only errors unrelated to this change).

- [ ] **Step 16: Commit**

```bash
git add actions/ lib/bundle.ts models/files.ts ai/attachments.ts app/
git commit -m "refactor: update all callers to pass entityId for uploads

All getUserUploadsDirectory and fullPathForFile calls now use entityId
instead of user/entity objects."
```

---

### Task 5: Update `instrumentation.ts` — boot the active entity's cluster

The instrumentation hook now reads the active entity and starts only that entity's cluster.

**Files:**
- Modify: `instrumentation.ts`

- [ ] **Step 1: Rewrite `register()`**

```typescript
/**
 * Next.js instrumentation hook — runs once per server process before the
 * first request. We boot the active entity's embedded PostgreSQL cluster
 * so any route that calls getPool() finds it ready.
 *
 * Skipped on the Edge runtime (Postgres can't run there).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { getEntities, getActiveEntityIdFromFile } = await import("./lib/entities")
  const entities = getEntities()

  if (entities.length === 0) {
    console.log("[instrumentation] No entities configured — skipping cluster startup")
    return
  }

  const activeId = getActiveEntityIdFromFile()
  const entity = entities.find((e) => e.id === activeId) ?? entities[0]

  // External DB entities don't need an embedded cluster
  if (entity.db) {
    console.log(`[instrumentation] Entity "${entity.id}" uses external DB — skipping cluster startup`)
    return
  }

  const { startCluster } = await import("./lib/embedded-pg")
  await startCluster(entity.id)
}
```

- [ ] **Step 2: Add `getActiveEntityIdFromFile` to `lib/entities.ts`**

The `instrumentation.ts` hook runs before any request, so `cookies()` is not available. We need a synchronous fallback that reads the entity ID from a file or env var. Add this to `lib/entities.ts`:

```typescript
/**
 * Get active entity ID without cookies (for instrumentation hook).
 * Reads from TAXINATOR_ACTIVE_ENTITY env var, or returns first entity.
 * The cookie-based getActiveEntityId() is used for request-time resolution.
 */
export function getActiveEntityIdFromFile(): string {
  const fromEnv = process.env.TAXINATOR_ACTIVE_ENTITY
  if (fromEnv) {
    const entities = getEntities()
    if (entities.some((e) => e.id === fromEnv)) return fromEnv
  }
  const entities = getEntities()
  return entities.length > 0 ? entities[0].id : "default"
}
```

- [ ] **Step 3: Update `setActiveEntity` to also set the env var**

When setting the cookie, also set `process.env.TAXINATOR_ACTIVE_ENTITY` so the next process startup (after restart) knows which entity to boot. But cookies don't survive restarts — we need a file. Add to `lib/entities.ts`:

```typescript
import { getDataRoot } from "./embedded-pg"

const ACTIVE_ENTITY_FILE = "active-entity"

/** Persist active entity ID to a file so instrumentation can read it on restart. */
function saveActiveEntityToFile(entityId: string): void {
  const filePath = path.join(getDataRoot(), ACTIVE_ENTITY_FILE)
  fs.writeFileSync(filePath, entityId, "utf-8")
}

/** Read persisted active entity ID from file. */
export function getActiveEntityIdFromFile(): string {
  const filePath = path.join(getDataRoot(), ACTIVE_ENTITY_FILE)
  try {
    const id = fs.readFileSync(filePath, "utf-8").trim()
    const entities = getEntities()
    if (entities.some((e) => e.id === id)) return id
  } catch {}
  const entities = getEntities()
  return entities.length > 0 ? entities[0].id : "default"
}
```

Then update `setActiveEntity`:

```typescript
export async function setActiveEntity(entityId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ENTITY_COOKIE, entityId, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  })
  saveActiveEntityToFile(entityId)
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit instrumentation.ts 2>&1 | head -10`

- [ ] **Step 5: Commit**

```bash
git add instrumentation.ts lib/entities.ts
git commit -m "feat: boot active entity's cluster on startup

instrumentation.ts reads persisted active entity and starts only that
cluster. Active entity ID persisted to data/active-entity file so it
survives server restarts."
```

---

### Task 6: Update `actions/entities.ts` — restart on switch, per-profile folders

Switch triggers `process.exit(0)`. Create/delete manage the `data/<entityId>/` folder.

**Files:**
- Modify: `actions/entities.ts`

- [ ] **Step 1: Rewrite `switchEntityAction` to restart**

```typescript
export async function switchEntityAction(entityId: string) {
  const entities = getEntities()
  if (!entities.some((e) => e.id === entityId)) {
    return { success: false, error: "Entity not found" }
  }

  await setActiveEntity(entityId)

  // Full server restart to boot the new entity's cluster
  setTimeout(() => process.exit(0), 100)

  return { success: true }
}
```

The 100ms delay gives time for the response to flush before the process exits.

- [ ] **Step 2: Rewrite `createLocalEntityAction` to init cluster**

```typescript
export async function createLocalEntityAction(data: {
  name: string
  type: EntityType
}) {
  const { codeFromName } = await import("@/lib/utils")
  const id = codeFromName(data.name)
  if (!id) return { success: false, error: "Invalid entity name" }

  if (getEntities().some((e) => e.id === id)) {
    return { success: false, error: "An entity with this name already exists" }
  }

  try {
    // Initialise the profile's Postgres cluster (creates data/<id>/pgdata/)
    const { initNewCluster } = await import("@/lib/embedded-pg")
    await initNewCluster(id)

    // Create uploads directory
    const { getEntityDataDir } = await import("@/lib/embedded-pg")
    const fs = await import("fs")
    fs.mkdirSync(path.join(getEntityDataDir(id), "uploads"), { recursive: true })

    addEntity({ id, name: data.name, type: data.type })
    await setActiveEntity(id)

    // Restart to boot the new entity's cluster
    setTimeout(() => process.exit(0), 100)

    return { success: true, entityId: id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create entity" }
  }
}
```

- [ ] **Step 3: Rewrite `removeEntityAction` to delete profile folder**

```typescript
export async function removeEntityAction(id: string) {
  const entity = getEntityById(id)
  if (!entity) {
    return { success: false, error: "Entity not found" }
  }

  try {
    await closePoolForEntity(id)

    // Delete the entire profile folder (pgdata + uploads + runtime.json)
    if (!entity.db) {
      const { getEntityDataDir } = await import("@/lib/embedded-pg")
      const fs = await import("fs")
      const entityDir = getEntityDataDir(id)
      try {
        fs.rmSync(entityDir, { recursive: true, force: true })
      } catch {}
    }

    removeEntity(id)

    // If we removed the active entity, switch to the first remaining one
    const cookieStore = await cookies()
    const current = cookieStore.get(ENTITY_COOKIE)?.value
    if (current === id) {
      const remaining = getEntities()
      if (remaining.length > 0) {
        await setActiveEntity(remaining[0].id)
      } else {
        cookieStore.delete(ENTITY_COOKIE)
      }
    }

    // Restart to clean up
    setTimeout(() => process.exit(0), 100)

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove entity" }
  }
}
```

- [ ] **Step 4: Remove `dataDir` parameter from `createLocalEntityAction`**

The `dataDir` parameter is no longer accepted — the entity ID determines the path. Already done in Step 2 above.

- [ ] **Step 5: Add `path` import at top of file**

```typescript
import path from "path"
```

- [ ] **Step 6: Verify the file compiles**

Run: `npx tsc --noEmit 2>&1 | grep "actions/entities" | head -10`

- [ ] **Step 7: Commit**

```bash
git add actions/entities.ts
git commit -m "feat: entity switch restarts server, create/delete manage profile folders

switchEntityAction triggers process.exit(0) for clean cluster swap.
createLocalEntityAction inits a new cluster + uploads dir.
removeEntityAction deletes the entire data/<id>/ folder."
```

---

### Task 7: Update the entity switcher UI for restart behavior

The `EntitySwitcher` component currently calls `router.refresh()` after switching. With the new restart behavior, it should show a loading state and wait for the page to reload.

**Files:**
- Modify: `components/sidebar/entity-switcher.tsx`

- [ ] **Step 1: Update the switch handler**

```typescript
const handleSwitch = (entityId: string) => {
  if (entityId === activeId) return
  startTransition(async () => {
    await switchEntityAction(entityId)
    // Server will restart — reload the page after a short delay
    // to give the process time to exit and come back up
    setTimeout(() => window.location.reload(), 1500)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add components/sidebar/entity-switcher.tsx
git commit -m "fix: entity switcher reloads page after server restart"
```

---

### Task 8: Clean up old data directories and reset entities

Delete the shared `pgdata/`, `runtime.json`, `uploads/`, and all legacy `*-pgdata` dirs. Reset `entities.json` to empty.

**Files:**
- Modify: `data/entities.json`
- Delete: `data/pgdata/` (directory)
- Delete: `data/runtime.json`
- Delete: `data/uploads/` (directory)
- Delete: `data/animus-systems-sl-pgdata/` (directory)
- Delete: `data/blabla-company-pgdata/` (directory)
- Delete: `data/ls-test-company-pgdata/` (directory)
- Delete: `data/sethmastertest-pgdata/` (directory)
- Delete: `data/testcompany-sl-pgdata/` (directory)

- [ ] **Step 1: Reset entities.json**

```bash
echo '[]' > data/entities.json
```

- [ ] **Step 2: Delete old shared data**

```bash
rm -rf data/pgdata data/runtime.json data/uploads
```

- [ ] **Step 3: Delete legacy per-entity pgdata dirs**

```bash
rm -rf data/animus-systems-sl-pgdata data/blabla-company-pgdata data/ls-test-company-pgdata data/sethmastertest-pgdata data/testcompany-sl-pgdata
```

- [ ] **Step 4: Delete active-entity file if it exists**

```bash
rm -f data/active-entity
```

- [ ] **Step 5: Verify data directory is clean**

```bash
ls -la data/
```

Expected: only `entities.json` (with `[]` content) and possibly `.gitkeep` or similar.

- [ ] **Step 6: Do NOT commit** — `data/` is gitignored, so there's nothing to commit here. This is a local cleanup step.

---

### Task 9: Update tests

Fix any tests that reference the old function signatures.

**Files:**
- Modify: `tests/contracts-and-files.test.ts`

- [ ] **Step 1: Read the existing test to see what needs updating**

Run: Read `tests/contracts-and-files.test.ts` to see if `getUserUploadsDirectory` or `fullPathForFile` are tested there with the old signatures.

- [ ] **Step 2: Update file path tests if needed**

The `safePathJoin` tests should be unaffected (it's a pure function). If `getUserUploadsDirectory` is tested directly, update the test to pass an entity ID string instead of a User object.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run 2>&1 | tail -15`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: update file path tests for entityId-based uploads"
```

---

### Task 10: Full integration test — create profile, switch, verify isolation

Manual verification that the entire flow works end-to-end.

- [ ] **Step 1: Start the dev server**

```bash
yarn dev
```

- [ ] **Step 2: Open the app and create a new profile**

Navigate to the entity creation UI. Create a profile (e.g. "Test Autonomo", type: autonomo).

Expected: server restarts, app reloads, new profile is active.

- [ ] **Step 3: Verify the profile folder was created**

```bash
ls -la data/test_autonomo/
```

Expected: `pgdata/`, `runtime.json`, `uploads/` all exist.

- [ ] **Step 4: Create a second profile**

Create another profile (e.g. "Test SL", type: sl).

Expected: server restarts, app reloads, second profile is active.

- [ ] **Step 5: Verify the second profile folder**

```bash
ls -la data/test_sl/
```

Expected: `pgdata/`, `runtime.json`, `uploads/` all exist.

- [ ] **Step 6: Switch between profiles**

Use the entity switcher dropdown to switch back to "Test Autonomo".

Expected: server restarts, page reloads, "Test Autonomo" is now active.

- [ ] **Step 7: Verify only one cluster is running**

```bash
ps aux | grep postgres | grep -v grep
```

Expected: only one `postgres` process with the active entity's port.

- [ ] **Step 8: Delete a profile and verify cleanup**

Delete "Test SL" from the settings.

Expected: `data/test_sl/` directory is completely removed.

- [ ] **Step 9: Type check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 10: Run tests**

Run: `npx vitest run`

Expected: all tests pass.

- [ ] **Step 11: Final commit**

```bash
git add -A
git commit -m "feat: per-profile data isolation

Each entity gets its own self-contained folder (data/<entityId>/) with
independent Postgres cluster, runtime config, and uploads directory.
Only one cluster runs at a time. Switching profiles restarts the server."
```

---

### Task 11: Data location settings UI

Add a "Data Location" section to the entities settings page that shows the current data root and lets the user change it via the existing folder browser. Changing the path writes `taxinator.config.json` and restarts the server.

**Files:**

- Create: `actions/config.ts`
- Create: `components/settings/data-location.tsx`
- Modify: `app/[locale]/(app)/settings/entities/page.tsx`
- Modify: `messages/en.json` (add translation keys)
- Modify: `messages/es.json` (add translation keys)

- [ ] **Step 1: Create server action for data location**

Create `actions/config.ts`:

```typescript
"use server"

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
    return { success: false, error: "Cannot create directory: " + (error instanceof Error ? error.message : "Unknown error") }
  }

  saveAppConfig({ dataDir: resolved })
  revalidatePath("/", "layout")

  // Restart to use new data location
  setTimeout(() => process.exit(0), 100)

  return { success: true }
}
```

- [ ] **Step 2: Create data location component**

Create `components/settings/data-location.tsx`:

```tsx
"use client"

import { updateDataLocationAction, getDataLocationAction } from "@/actions/config"
import { listDirectoriesAction, createDirectoryAction } from "@/actions/entities"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FolderOpen, Loader2, ChevronRight, Home, HardDrive } from "lucide-react"
import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"

export function DataLocation({ currentPath }: { currentPath: string }) {
  const t = useTranslations("settings")
  const [showBrowser, setShowBrowser] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSelect = (selectedPath: string) => {
    if (!confirm(t("changeDataLocationConfirm"))) return
    startTransition(async () => {
      const result = await updateDataLocationAction(selectedPath)
      if (!result.success) {
        alert(result.error)
      }
      // Server restarts — page will reload
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3 min-w-0">
            <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("dataLocation")}</p>
              <p className="text-xs text-muted-foreground truncate">{currentPath}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBrowser(!showBrowser)}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("change")}
          </Button>
        </CardContent>
      </Card>

      {showBrowser && (
        <FolderBrowser
          initialPath={currentPath}
          onSelect={handleSelect}
          onCancel={() => setShowBrowser(false)}
        />
      )}
    </div>
  )
}

function FolderBrowser({
  initialPath,
  onSelect,
  onCancel,
}: {
  initialPath: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const t = useTranslations("settings")
  const [currentDir, setCurrentDir] = useState(initialPath)
  const [dirs, setDirs] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<{ name: string; path: string }[]>([])
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDir = async (dirPath: string) => {
    setLoading(true)
    const result = await listDirectoriesAction(dirPath)
    setCurrentDir(result.current)
    setDirs(result.directories)
    setShortcuts(result.shortcuts ?? [])
    setParentDir(result.parent)
    setLoading(false)
  }

  // Load initial directory
  useState(() => {
    void loadDir(initialPath)
  })

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span className="truncate font-mono text-xs">{currentDir}</span>
        </div>

        <div className="border rounded-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Loading...
            </div>
          ) : (
            <>
              {parentDir && (
                <button
                  onClick={() => loadDir(parentDir)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 border-b"
                >
                  <ChevronRight className="h-3 w-3 rotate-180" /> ..
                </button>
              )}
              {shortcuts.length > 0 && (
                <>
                  {shortcuts.map((s) => (
                    <button
                      key={s.path}
                      onClick={() => loadDir(s.path)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 border-b"
                    >
                      <HardDrive className="h-3 w-3" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </>
              )}
              {dirs.map((dir) => (
                <button
                  key={dir}
                  onClick={() => loadDir(currentDir + "/" + dir)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                >
                  <FolderOpen className="h-3 w-3" />
                  <span className="truncate">{dir}</span>
                </button>
              ))}
              {dirs.length === 0 && !parentDir && (
                <p className="p-3 text-sm text-muted-foreground">{t("noFolders")}</p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSelect(currentDir)}>
            {t("selectFolder")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Add to entities settings page**

Update `app/[locale]/(app)/settings/entities/page.tsx`:

```tsx
import { DataLocation } from "@/components/settings/data-location"
import { EntityManager } from "@/components/settings/entity-manager"
import { getDataRoot } from "@/lib/embedded-pg"
import { getEntities } from "@/lib/entities"
import { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

export const metadata: Metadata = { title: "Entities" }

export default async function EntitiesSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("settings")
  const entities = getEntities()
  const dataRoot = getDataRoot()

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("companies")}</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-prose">{t("companiesDesc")}</p>
      <EntityManager entities={entities} />

      <h2 className="text-lg font-semibold mt-10 mb-2">{t("dataLocationTitle")}</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-prose">{t("dataLocationDesc")}</p>
      <DataLocation currentPath={dataRoot} />
    </div>
  )
}
```

- [ ] **Step 4: Add translation keys to `messages/en.json`**

Add under the `"settings"` key:

```json
"dataLocation": "Current location",
"dataLocationTitle": "Data Location",
"dataLocationDesc": "All profile data (databases, uploads) is stored in this folder. You can point this at an external drive or cloud-synced folder.",
"changeDataLocationConfirm": "Changing the data location will restart the server. Existing data will not be moved automatically. Continue?",
"change": "Change",
"selectFolder": "Select this folder",
"noFolders": "No subfolders"
```

- [ ] **Step 5: Add translation keys to `messages/es.json`**

Add matching keys with Spanish translations:

```json
"dataLocation": "Ubicación actual",
"dataLocationTitle": "Ubicación de datos",
"dataLocationDesc": "Todos los datos de perfil (bases de datos, archivos) se guardan en esta carpeta. Puedes apuntar a un disco externo o carpeta sincronizada en la nube.",
"changeDataLocationConfirm": "Cambiar la ubicación de datos reiniciará el servidor. Los datos existentes no se moverán automáticamente. ¿Continuar?",
"change": "Cambiar",
"selectFolder": "Seleccionar esta carpeta",
"noFolders": "No hay subcarpetas"
```

- [ ] **Step 6: Add `taxinator.config.json` to `.gitignore`**

Append to `.gitignore`:

```gitignore
taxinator.config.json
```

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add actions/config.ts components/settings/data-location.tsx app/\[locale\]/\(app\)/settings/entities/page.tsx messages/en.json messages/es.json .gitignore
git commit -m "feat: configurable data location from settings UI

Browse and select a different folder for all profile data.
Writes taxinator.config.json at app root, restarts server to apply."
```
