/**
 * Physical SQLite database backup.
 *
 * The per-tenant JSON export (src/lib/backup.ts) is a logical export, good
 * for tenant-scoped restore + portability. It is NOT a byte-faithful
 * replica of the database (no indexes, no cross-tenant integrity, no
 * schema). This script complements it with a full physical snapshot:
 *
 *   1. WAL checkpoint (TRUNCATE) so all committed pages are folded back
 *      into the main db file — otherwise a copy taken mid-WAL can miss the
 *      most recent transactions.
 *   2. `VACUUM INTO` — SQLite's atomic, online hot-backup. Produces a
 *      defragmented, self-consistent copy without blocking writers and
 *      without the foot-guns of copying a live file by hand.
 *
 * Output: backups/db/<yyyy-mm-dd_HHMMSS>.db, plus prunes snapshots older
 * than BACKUP_RETENTION_DAYS (default 14).
 *
 * Run via Task Scheduler (scripts/register-db-backup-task.ps1) or:
 *   npx tsx scripts/db-backup.ts
 */

import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

function resolveDbFile(): string {
  const configured = process.env.DATABASE_URL;
  if (configured && configured.startsWith("file:")) return configured.slice("file:".length);
  if (configured && !configured.includes("://")) return configured;
  return path.join(process.cwd(), "prisma", "dev.db");
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main(): void {
  const src = resolveDbFile();
  if (!fs.existsSync(src)) {
    console.error(`[db-backup] source db not found: ${src}`);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "backups", "db");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${timestamp()}.db`);

  const db = new Database(src);
  try {
    // Fold the WAL back into the main file so the snapshot is complete.
    db.pragma("wal_checkpoint(TRUNCATE)");
    // Atomic online hot-backup. VACUUM INTO requires a path literal; it is
    // not parameterizable, so escape embedded single quotes defensively.
    const escaped = outFile.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    db.close();
  }

  const bytes = fs.statSync(outFile).size;
  console.log(`[db-backup] wrote ${outFile} (${bytes} bytes)`);

  // Integrity check the snapshot before we trust it for retention pruning.
  const verify = new Database(outFile, { readonly: true });
  try {
    const row = verify.pragma("integrity_check", { simple: true });
    if (row !== "ok") {
      console.error(`[db-backup] integrity_check FAILED on snapshot: ${String(row)}`);
      process.exit(2);
    }
  } finally {
    verify.close();
  }

  // Prune old snapshots.
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? "14");
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const f of fs.readdirSync(outDir)) {
    if (!f.endsWith(".db")) continue;
    const full = path.join(outDir, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      pruned++;
    }
  }
  console.log(`[db-backup] integrity ok; pruned ${pruned} snapshot(s) older than ${retentionDays}d`);
}

main();
