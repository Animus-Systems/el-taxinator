# Per-Profile Data Isolation

Each entity/profile gets its own self-contained folder under `data/<entityId>/` with an independent Postgres cluster, runtime config, and uploads directory. Only one cluster runs at a time (the active profile). Switching profiles restarts the server.

## Directory Layout

```
data/
├── entities.json                 # Global registry of all profiles
├── <entityId>/
│   ├── pgdata/                   # Independent Postgres 17 cluster
│   ├── runtime.json              # Cluster port + password
│   └── uploads/                  # All uploaded files for this profile
│       ├── unsorted/
│       ├── previews/
│       ├── static/
│       ├── csv/
│       └── YYYY/MM/...
```

Each profile folder is fully portable — zip it, copy to another machine, restore.

## Decisions

- **One cluster at a time.** Only the active profile's Postgres runs. Saves resources, simplifies reasoning.
- **Profile switch = full server restart.** `process.exit()` after setting the cookie. Next.js restarts and boots the new profile's cluster. Cleanest way to guarantee no stale connections or cached state.
- **Fresh start.** No migration of existing data. Old shared `pgdata/`, legacy `*-pgdata` dirs, and shared `uploads/` are deleted.
- **Database name inside each cluster is fixed** (e.g. `taxinator`), since each cluster only serves one entity. The entity ID is the folder name, not the DB name.
- **`entities.json` stays global** at `<dataRoot>/entities.json`. It's the registry that tells the app which profiles exist and which folder to look in.
- **Configurable data root.** The data root path is stored in `taxinator.config.json` at the app's cwd (outside the data directory so moving data doesn't break the reference). UI settings page allows browsing and selecting a new folder. Changing it triggers a restart. Precedence: `taxinator.config.json` > `TAXINATOR_DATA_DIR` env var > `./data`.

## Data Root Configuration

The data root is where all profile folders, `entities.json`, and `active-entity` live. It's resolved in this order:

1. `taxinator.config.json` in cwd — `{ "dataDir": "/path/to/data" }`
2. `TAXINATOR_DATA_DIR` environment variable
3. `./data` (default)

The config file lives at the app root (cwd), not inside the data directory. This means you can point it at an external drive, NAS, or cloud-synced folder and everything just works.

### `taxinator.config.json`

```json
{
  "dataDir": "/Volumes/ExternalDrive/taxinator-data"
}
```

### UI: Settings > Data Location

The settings page shows the current data root path and a "Change" button that opens the folder browser (reuses the existing `listDirectoriesAction` pattern). Changing the path:

1. Writes the new path to `taxinator.config.json`
2. Triggers a server restart
3. On restart, the app reads the new data root and finds profiles there

## File-by-File Changes

### `lib/embedded-pg.ts`

Current: starts a single shared cluster at `data/pgdata/`, stores runtime at `data/runtime.json`, creates per-entity databases inside the cluster.

New:
- `startCluster(entityId: string)` — cluster data dir becomes `data/<entityId>/pgdata/`, runtime file becomes `data/<entityId>/runtime.json`.
- Remove `ensureDatabase()` — no longer needed since each cluster has one fixed database name.
- `getEmbeddedConnectionString()` — returns connection to the fixed DB name (e.g. `taxinator`) in the entity's cluster.
- `stopCluster()` — unchanged logic, still stops the single running cluster.
- `initNewCluster(entityId: string)` — new function. Creates `data/<entityId>/pgdata/` and runs `initdb` for a fresh profile. Called when creating a new entity.

### `lib/entities.ts`

Current: `getPool()` reads active entity cookie, `getPoolForEntity()` connects to entity-named database in shared cluster. `resolveConnectionString()` builds URL with entity ID as DB name.

New:
- `resolveConnectionString()` — for embedded entities, uses the running cluster's port/password from `data/<entityId>/runtime.json` and connects to the fixed DB name.
- `getPool()` — simplified. Since only one cluster runs, there's effectively one pool. Still reads active entity for external DB support.
- `getPoolForEntity()` — only valid for the active entity (embedded) or any external entity. Calling it for a non-active embedded entity is an error.
- Remove pool caching by entity ID — only one embedded pool exists at a time.
- `addEntity()` — after writing to `entities.json`, calls `initNewCluster(entityId)` to set up the profile folder.
- `removeEntity()` — deletes `data/<entityId>/` entirely (rm -rf). Removes entry from `entities.json`.

### `lib/files.ts`

Current: `getUserUploadsDirectory()` checks `entity.dataDir` or falls back to `UPLOAD_PATH/{email}`.

New:
- `getUserUploadsDirectory()` — returns `data/<entityId>/uploads/`. The `entity.dataDir` override is removed (the entity ID determines the path). No more email-based fallback.
- `UPLOAD_PATH` env var removed or repurposed — the data dir root (`TAXINATOR_DATA_DIR`) is the only config.
- `fullPathForFile()` — updated to use new uploads path.

### `lib/schema.ts`

No changes. `ensureSchema(pool)` still checks for the `users` table and applies `schema.sql` if missing. Works the same regardless of which cluster the pool connects to.

### `actions/entities.ts`

Current: `switchEntityAction()` sets cookie and revalidates. `createLocalEntityAction()` adds to `entities.json`. `removeEntityAction()` optionally deletes `entity.dataDir`.

New:
- `switchEntityAction(entityId)` — sets the `TAXINATOR_ENTITY` cookie, then calls `process.exit(0)`. Next.js dev server restarts automatically. In production, the process manager (systemd, pm2, etc.) restarts it.
- `createLocalEntityAction(data)` — generates entity ID, creates `data/<entityId>/` folder, runs `initNewCluster(entityId)`, adds to `entities.json`, switches to it (restart).
- `removeEntityAction(id)` — stops cluster if it's the active one, deletes `data/<id>/` recursively, removes from `entities.json`, switches to first remaining entity (restart).
- `updateEntityAction()` — unchanged for name/type updates. If switching between embedded/external, handles cluster start/stop.

### `instrumentation.ts`

Current: calls `startCluster()` unconditionally on server startup.

New:
- Reads the active entity ID (from cookie or first entity in `entities.json`).
- If the entity uses embedded Postgres, calls `startCluster(entityId)`.
- If the entity uses an external DB (`entity.db`), skips cluster startup.
- If no entities exist, skips startup (first-run state, entity picker will handle it).

### Cleanup (one-time)

Delete from the `data/` directory:
- `pgdata/` (shared cluster)
- `runtime.json` (shared runtime config)
- `uploads/` (shared uploads)
- `animus-systems-sl-pgdata/`
- `blabla-company-pgdata/`
- `ls-test-company-pgdata/`
- `sethmastertest-pgdata/`
- `testcompany-sl-pgdata/`

Reset `entities.json` to `[]` (fresh start).

### `.gitignore`

Ensure `data/` is already ignored (it is). No changes needed.

## Backup and Recovery

**Backup a profile:** zip `data/<entityId>/` — contains everything (DB cluster data, uploads, runtime config).

**Restore a profile:** unzip into `data/`, add entry to `entities.json`, switch to it.

**Existing JSON backup/restore** (settings page) continues to work unchanged — it operates on the active database regardless of where the cluster lives.

## Edge Cases

- **First run (no entities):** `entities.json` is `[]`. The app shows the entity creation UI. Creating the first entity initializes its folder and restarts.
- **All entities deleted:** Same as first run. App shows entity creation UI.
- **External DB entities:** No local folder needed for pgdata. Uploads still go to `data/<entityId>/uploads/`. No cluster started.
- **Crash during switch:** Cookie is set but server hasn't restarted yet. On next startup, reads cookie, starts correct cluster. Safe.
- **Profile folder missing but in `entities.json`:** Treat as corrupted. Show error with option to recreate or remove.

## What Does NOT Change

- `schema.sql` — identical schema, applied per-cluster
- All model files (`models/*`) — same SQL queries, same `user_id` scoping
- All tRPC routers (`lib/trpc/routers/*`) — same procedures
- UI components — same (entity picker already exists)
- Auth flow — same
- Test suite — same (tests mock the DB)
- `TAXINATOR_DATA_DIR` env var — still controls the root data directory
