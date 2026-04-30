#!/usr/bin/env tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

type Target = "identity" | "app";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const usage = (): never => {
  process.stderr.write(
    [
      "Usage: dbctl <command> [options]",
      "",
      "Commands:",
      "  ensure-dbs --db <name> [--db <name> ...]",
      "      Create the named databases on the admin connection if missing.",
      "",
      "  apply --target <identity|app> --url <connection-string>",
      "      Apply pending migrations from database/<target>/migrations/ to the",
      "      database at <connection-string>.",
      "",
      "  status --target <identity|app> --url <connection-string>",
      "      Print applied vs pending migrations.",
      "",
      "  bootstrap-dev",
      "      Convenience: ensure identity_db + app_db on the admin URL, then apply",
      "      both targets. Reads URLs from env (see below).",
      "",
      "  seed-dev",
      "      Insert deterministic dev fixtures (demo identity user).",
      "",
      "  dev-set-passwords --password <pw>",
      "      ALTER ROLE every login role to <pw>. Must run with admin privileges.",
      "",
      "  baseline-export --target <identity|app> --url <connection-string> --out <file>",
      "      pg_dump --schema-only into <file>.",
      "",
      "Env vars:",
      "  IDENTITY_DB_ADMIN_URL  Admin connection used by ensure-dbs / bootstrap-dev.",
      "  APP_DB_ADMIN_URL       Admin connection used by ensure-dbs / bootstrap-dev.",
      "  IDENTITY_DB_URL        App-role connection (kept here for parity).",
      "  APP_DB_URL             App-role connection.",
      "  DBCTL_DEV_PASSWORD     Default password for dev-set-passwords if --password absent.",
      "",
    ].join("\n"),
  );
  process.exit(2);
};

const parseArgs = (argv: string[]): { command: string; flags: Map<string, string[]> } => {
  if (argv.length === 0) usage();
  const command = argv[0]!;
  const flags = new Map<string, string[]>();
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      process.stderr.write(`Unexpected positional argument: ${arg}\n`);
      usage();
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(key, [...(flags.get(key) ?? []), "true"]);
    } else {
      flags.set(key, [...(flags.get(key) ?? []), next]);
      i++;
    }
  }
  return { command, flags };
};

const requireFlag = (flags: Map<string, string[]>, key: string): string => {
  const value = flags.get(key)?.[0];
  if (!value || value === "true") {
    process.stderr.write(`Missing required --${key}\n`);
    process.exit(2);
  }
  return value;
};

const requireTarget = (flags: Map<string, string[]>): Target => {
  const value = requireFlag(flags, "target");
  if (value !== "identity" && value !== "app") {
    process.stderr.write(`--target must be 'identity' or 'app'\n`);
    process.exit(2);
  }
  return value;
};

const sortMigrations = (files: string[]): string[] =>
  files
    .filter((f) => f.endsWith(".sql"))
    .map((name) => {
      const match = /^(\d+)_/.exec(name);
      const leading = match ? Number.parseInt(match[1]!, 10) : -1;
      return { name, leading };
    })
    .sort((a, b) => (a.leading - b.leading) || a.name.localeCompare(b.name))
    .map((entry) => entry.name);

const sha256OfFile = async (filePath: string): Promise<string> => {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.promises.readFile(filePath));
  return hash.digest("hex");
};

const ensureSchemaMigrationsTable = async (client: pg.Client): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id              bigserial PRIMARY KEY,
      filename        text NOT NULL UNIQUE,
      checksum_sha256 text NOT NULL,
      applied_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
};

const getApplied = async (client: pg.Client): Promise<Map<string, string>> => {
  const result = await client.query<{ filename: string; checksum_sha256: string }>(
    "SELECT filename, checksum_sha256 FROM public.schema_migrations",
  );
  const map = new Map<string, string>();
  for (const row of result.rows) map.set(row.filename, row.checksum_sha256);
  return map;
};

const migrationsDirFor = (target: Target): string =>
  path.join(REPO_ROOT, "database", target, "migrations");

const apply = async (target: Target, connectionString: string): Promise<void> => {
  const dir = migrationsDirFor(target);
  if (!fs.existsSync(dir)) throw new Error(`Missing migrations dir: ${dir}`);

  const filenames = sortMigrations(fs.readdirSync(dir));
  if (filenames.length === 0) throw new Error(`No .sql files in ${dir}`);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await ensureSchemaMigrationsTable(client);
    const applied = await getApplied(client);

    let appliedCount = 0;
    for (const filename of filenames) {
      const filePath = path.join(dir, filename);
      const checksum = await sha256OfFile(filePath);
      const existing = applied.get(filename);
      if (existing) {
        if (existing !== checksum) {
          throw new Error(
            `Migration ${filename} checksum drift (db=${existing}, file=${checksum}). `
              + `Migrations are immutable once applied.`,
          );
        }
        continue;
      }

      const sql = await fs.promises.readFile(filePath, "utf8");
      process.stdout.write(`[apply] ${target}: ${filename} `);
      await client.query(sql);
      await client.query(
        "INSERT INTO public.schema_migrations(filename, checksum_sha256) VALUES ($1, $2)",
        [filename, checksum],
      );
      process.stdout.write("ok\n");
      appliedCount++;
    }

    process.stdout.write(`[apply] ${target}: ${appliedCount} new, ${applied.size} already applied\n`);
  } finally {
    await client.end();
  }
};

const status = async (target: Target, connectionString: string): Promise<void> => {
  const dir = migrationsDirFor(target);
  const filenames = sortMigrations(fs.readdirSync(dir));
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await ensureSchemaMigrationsTable(client);
    const applied = await getApplied(client);
    for (const filename of filenames) {
      const status = applied.has(filename) ? "applied" : "pending";
      process.stdout.write(`${status.padEnd(8)} ${filename}\n`);
    }
  } finally {
    await client.end();
  }
};

const ensureDbs = async (databases: string[]): Promise<void> => {
  const adminUrl = process.env["IDENTITY_DB_ADMIN_URL"] ?? process.env["APP_DB_ADMIN_URL"];
  if (!adminUrl) throw new Error("Set IDENTITY_DB_ADMIN_URL or APP_DB_ADMIN_URL");

  // Connect to the postgres maintenance DB to issue CREATE DATABASE.
  const url = new URL(adminUrl);
  url.pathname = "/postgres";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    for (const db of databases) {
      const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
      if (exists.rowCount && exists.rowCount > 0) continue;
      // pg_database name is an identifier — must be safely quoted, not parameterised.
      const quoted = `"${db.replace(/"/g, '""')}"`;
      await client.query(`CREATE DATABASE ${quoted}`);
      process.stdout.write(`[ensure-dbs] created ${db}\n`);
    }
  } finally {
    await client.end();
  }
};

const bootstrapDev = async (): Promise<void> => {
  const identityAdmin = process.env["IDENTITY_DB_ADMIN_URL"];
  const appAdmin = process.env["APP_DB_ADMIN_URL"];
  if (!identityAdmin || !appAdmin) {
    throw new Error("Set IDENTITY_DB_ADMIN_URL and APP_DB_ADMIN_URL for bootstrap-dev.");
  }
  const idDbName = new URL(identityAdmin).pathname.replace(/^\//, "") || "identity_db";
  const appDbName = new URL(appAdmin).pathname.replace(/^\//, "") || "app_db";
  await ensureDbs([idDbName, appDbName]);
  await apply("identity", identityAdmin);
  await apply("app", appAdmin);
};

const seedDev = async (): Promise<void> => {
  const identityAdmin = process.env["IDENTITY_DB_ADMIN_URL"];
  if (!identityAdmin) throw new Error("Set IDENTITY_DB_ADMIN_URL");

  const demoUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  const client = new Client({ connectionString: identityAdmin });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO iam.user_account(id, email, email_verified, display_name, is_active)
       VALUES ($1, 'demo@example.com', true, 'Demo User', true)
       ON CONFLICT (id) DO UPDATE SET email_verified = EXCLUDED.email_verified, updated_at = now()`,
      [demoUserId],
    );
    process.stdout.write(`[seed-dev] identity user ${demoUserId} (demo@example.com)\n`);
  } finally {
    await client.end();
  }
};

const devSetPasswords = async (password: string): Promise<void> => {
  const adminUrl = process.env["IDENTITY_DB_ADMIN_URL"] ?? process.env["APP_DB_ADMIN_URL"];
  if (!adminUrl) throw new Error("Set IDENTITY_DB_ADMIN_URL or APP_DB_ADMIN_URL");

  const roles = [
    // Identity DB logins (defined in identity/01_roles.sql)
    "identity_migrator",
    "identity_app",
    "identity_breakglass",
    "identity_readonly_login",
    // App DB logins (defined in app/00_platform.sql once written)
    "app_api_login",
    "tenant_admin_login",
    "platform_admin_login",
    "worker_login",
  ];

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    for (const role of roles) {
      const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (!exists.rowCount) continue;
      const escaped = password.replace(/'/g, "''");
      const quotedRole = `"${role.replace(/"/g, '""')}"`;
      await client.query(`ALTER ROLE ${quotedRole} PASSWORD '${escaped}'`);
      process.stdout.write(`[dev-set-passwords] ${role}\n`);
    }
  } finally {
    await client.end();
  }
};

const baselineExport = async (target: Target, connectionString: string, outFile: string): Promise<void> => {
  const { spawn } = await import("node:child_process");
  const url = new URL(connectionString);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ""),
  };
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", ["--schema-only", "--no-owner", "--no-privileges"], { env });
    const out = fs.createWriteStream(outFile);
    child.stdout.pipe(out);
    child.stderr.pipe(process.stderr);
    child.on("exit", (code) => {
      out.close();
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
    child.on("error", reject);
  });
  process.stdout.write(`[baseline-export] ${target} -> ${outFile}\n`);
};

const main = async (): Promise<number> => {
  const { command, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "apply":
      await apply(requireTarget(flags), requireFlag(flags, "url"));
      return 0;
    case "status":
      await status(requireTarget(flags), requireFlag(flags, "url"));
      return 0;
    case "ensure-dbs": {
      const dbs = flags.get("db");
      if (!dbs || dbs.length === 0) {
        process.stderr.write("ensure-dbs requires at least one --db <name>\n");
        return 2;
      }
      await ensureDbs(dbs);
      return 0;
    }
    case "bootstrap-dev":
      await bootstrapDev();
      return 0;
    case "seed-dev":
      await seedDev();
      return 0;
    case "dev-set-passwords": {
      const password = flags.get("password")?.[0] ?? process.env["DBCTL_DEV_PASSWORD"];
      if (!password || password === "true") {
        process.stderr.write("dev-set-passwords requires --password or DBCTL_DEV_PASSWORD\n");
        return 2;
      }
      await devSetPasswords(password);
      return 0;
    }
    case "baseline-export":
      await baselineExport(
        requireTarget(flags),
        requireFlag(flags, "url"),
        requireFlag(flags, "out"),
      );
      return 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      return usage();
  }
};

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
