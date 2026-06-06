/**
 * Physical PostgreSQL database backup (pg_dump custom format).
 *
 * The per-tenant JSON export (src/lib/backup.ts) is a logical, tenant-scoped
 * export, good for portability. This script complements it with a full
 * physical snapshot of the whole database via `pg_dump -Fc` (custom format:
 * compressed, selectively restorable with pg_restore).
 *
 * Output: backups/db/<yyyy-mm-dd_HHMMSS>.dump, plus prunes snapshots older
 * than BACKUP_RETENTION_DAYS (default 14). The dump is verified by listing
 * its table of contents with pg_restore before pruning.
 *
 * Requires the Postgres client tools on PATH (pg_dump / pg_restore). On
 * Windows they live under e.g. C:\Program Files\PostgreSQL\16\bin — set
 * PG_BIN to that directory (or PG_DUMP / PG_RESTORE to the exes) if not on
 * PATH.
 *
 * Run via Task Scheduler (scripts/register-db-backup-task.ps1) or:
 *   npx tsx scripts/db-backup.ts
 */

import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Strip Prisma-only query params (e.g. `?schema=public`) that libpq tools
 * like pg_dump don't understand. The target schema is set via PGOPTIONS
 * instead so a non-public schema still dumps correctly.
 */
function libpqConnString(url: string): { connectionString: string; schema: string | null } {
  try {
    const u = new URL(url);
    const schema = u.searchParams.get("schema");
    u.searchParams.delete("schema");
    return { connectionString: u.toString(), schema };
  } catch {
    return { connectionString: url, schema: null };
  }
}

function resolveTool(name: "pg_dump" | "pg_restore"): string {
  const explicit = name === "pg_dump" ? process.env.PG_DUMP : process.env.PG_RESTORE;
  if (explicit && explicit.trim()) return explicit.trim();
  const dir = process.env.PG_BIN;
  if (dir && dir.trim()) return path.join(dir.trim(), name);
  return name; // rely on PATH
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main(): void {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
    console.error("[db-backup] DATABASE_URL must be a postgresql:// connection string.");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "backups", "db");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${timestamp()}.dump`);

  const { connectionString: pgUrl, schema } = libpqConnString(connectionString);
  // Restrict to the configured schema (default public) via PGOPTIONS.
  const env = { ...process.env, PGOPTIONS: `-c search_path=${schema ?? "public"}` };

  // Atomic, online, transaction-consistent snapshot. Custom format (-Fc).
  const dump = spawnSync(
    resolveTool("pg_dump"),
    ["--format=custom", "--no-owner", "--no-privileges", `--dbname=${pgUrl}`, "--file", outFile],
    { stdio: ["ignore", "inherit", "inherit"], env },
  );
  if (dump.error) {
    console.error(`[db-backup] pg_dump failed to launch: ${dump.error.message}`);
    process.exit(1);
  }
  if (dump.status !== 0) {
    console.error(`[db-backup] pg_dump exited ${dump.status}`);
    process.exit(2);
  }

  const bytes = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  if (bytes === 0) {
    console.error("[db-backup] snapshot is empty");
    process.exit(2);
  }
  console.log(`[db-backup] wrote ${outFile} (${bytes} bytes)`);

  // Verify the archive is readable before we trust it for retention pruning.
  const verify = spawnSync(resolveTool("pg_restore"), ["--list", outFile], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (verify.status !== 0) {
    console.error(`[db-backup] pg_restore --list FAILED on snapshot (exit ${verify.status})`);
    process.exit(2);
  }

  // Prune old snapshots.
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? "14");
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const f of fs.readdirSync(outDir)) {
    if (!f.endsWith(".dump")) continue;
    const full = path.join(outDir, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      pruned++;
    }
  }
  console.log(`[db-backup] verified; pruned ${pruned} snapshot(s) older than ${retentionDays}d`);
}

main();
