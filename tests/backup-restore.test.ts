import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { useTempDevDb } from "./_db";

/**
 * Backup -> restore round trip. Seed a tenant with a project + a couple of
 * child rows, back it up, delete it, then restoreTenant() from the dump and
 * confirm the graph comes back. Also pins the super-admin gate and the
 * dry-run-by-default behaviour.
 */

const { cleanupFile } = useTempDevDb("backup-restore");

let prisma: PrismaClient;
let backupTenant: typeof import("@/lib/backup").backupTenant;
let restoreTenant: typeof import("@/lib/backup").restoreTenant;

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ backupTenant, restoreTenant } = await import("@/lib/backup"));
});

afterAll(async () => {
  await prisma?.$disconnect();
  cleanupFile();
});

async function seedTenant() {
  const tenant = await prisma.tenant.create({
    data: { name: `restore-${Date.now()}`, slug: `restore-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, primaryMode: "VERTICAL", backupEnabled: true },
  });
  const project = await prisma.project.create({
    data: { tenantId: tenant.id, name: "Restore proj", code: `RP-${Date.now()}`, mode: "VERTICAL" },
  });
  await prisma.dailyLog.create({
    data: { projectId: project.id, logDate: new Date(), logType: "GENERAL", summary: "seed log", manpower: 3, weather: "Clear" },
  });
  await prisma.company.create({ data: { tenantId: tenant.id, name: "Acme Sub", companyType: "SUBCONTRACTOR" } });
  return { tenant, project };
}

function readBackupPath(localPath: string): string {
  // backupTenant writes to ./uploads/backups/<slug>/<date>.json under cwd.
  const fs = require("node:fs") as typeof import("node:fs");
  return fs.readFileSync(localPath, "utf8");
}

describe("restoreTenant", () => {
  it("refuses to run without super-admin", async () => {
    const res = await restoreTenant("{}", { isSuperAdmin: false });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/super-admin/);
  });

  it("dry-runs by default and writes nothing", async () => {
    const { tenant } = await seedTenant();
    const backup = await backupTenant(tenant.id);
    expect(backup.ok).toBe(true);
    const payload = readBackupPath(backup.localPath!);

    // Delete the tenant graph so a real restore would have to recreate it.
    await prisma.tenant.delete({ where: { id: tenant.id } });

    const dry = await restoreTenant(payload, { isSuperAdmin: true });
    expect(dry.ok).toBe(true);
    expect(dry.dryRun).toBe(true);
    expect(dry.planned.tenant).toBe(1);
    expect(dry.planned.projects).toBe(1);
    expect(dry.planned.dailyLogs).toBe(1);
    expect(dry.restored).toBeUndefined();

    // Nothing was written.
    const exists = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    expect(exists).toBeNull();
  });

  it("restores the full graph when confirmed", async () => {
    const { tenant, project } = await seedTenant();
    const backup = await backupTenant(tenant.id);
    const payload = readBackupPath(backup.localPath!);

    await prisma.tenant.delete({ where: { id: tenant.id } });
    expect(await prisma.tenant.findUnique({ where: { id: tenant.id } })).toBeNull();

    const res = await restoreTenant(payload, { isSuperAdmin: true, dryRun: false, confirm: true });
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(false);
    expect(res.restored?.tenant).toBe(1);
    expect(res.restored?.projects).toBe(1);
    expect(res.restored?.dailyLogs).toBe(1);
    expect(res.restored?.companies).toBe(1);

    // Verify the rows actually came back.
    const t = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    expect(t?.slug).toBe(tenant.slug);
    const p = await prisma.project.findUnique({ where: { id: project.id } });
    expect(p?.name).toBe("Restore proj");
    const logs = await prisma.dailyLog.count({ where: { projectId: project.id } });
    expect(logs).toBe(1);
  });

  it("requires confirm:true even when dryRun:false", async () => {
    const { tenant } = await seedTenant();
    const backup = await backupTenant(tenant.id);
    const payload = readBackupPath(backup.localPath!);
    const res = await restoreTenant(payload, { isSuperAdmin: true, dryRun: false });
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(res.error).toMatch(/confirm/);
  });
});
