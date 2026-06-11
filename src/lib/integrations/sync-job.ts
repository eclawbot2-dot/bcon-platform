/**
 * IntegrationSyncJob state-machine wrapper (ported from the portfolio's
 * gcon pattern, tenant-scoped for bcon). Every concrete sync routine runs
 * inside runSyncJob() so each run leaves an append-only history row:
 * RUNNING → OK | PARTIAL | FAILED with read/write counts. The history
 * table on Settings → Integrations renders these rows.
 */

import { prisma } from "@/lib/prisma";

export type SyncJobResult = {
  recordsRead: number;
  recordsWritten: number;
  partial?: boolean;
  note?: string;
};

/**
 * A RUNNING job of the same (tenant, provider, kind) younger than this
 * blocks a new run — double-clicked "Sync now" buttons otherwise launch
 * duplicate provider pulls. Older RUNNING rows are treated as crashed
 * (process died before the FAILED transition) and don't block.
 */
const IN_FLIGHT_WINDOW_MS = 10 * 60 * 1000;

export async function runSyncJob<T extends SyncJobResult>(
  tenantId: string,
  provider: string,
  kind: string,
  body: () => Promise<T>,
): Promise<{ jobId: string; status: "OK" | "FAILED" | "PARTIAL" | "SKIPPED"; result: T | null; error?: string }> {
  const inFlight = await prisma.integrationSyncJob.findFirst({
    where: {
      tenantId,
      provider,
      kind,
      status: "RUNNING",
      startedAt: { gte: new Date(Date.now() - IN_FLIGHT_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (inFlight) {
    return { jobId: inFlight.id, status: "SKIPPED", result: null, error: `a ${kind} sync is already running` };
  }

  const job = await prisma.integrationSyncJob.create({
    data: { tenantId, provider, kind, status: "RUNNING" },
  });

  try {
    const result = await body();
    const status = result.partial ? "PARTIAL" : "OK";
    await prisma.integrationSyncJob.update({
      where: { id: job.id },
      data: {
        status,
        completedAt: new Date(),
        recordsRead: result.recordsRead,
        recordsWritten: result.recordsWritten,
        error: result.note ?? null,
      },
    });
    return { jobId: job.id, status, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.integrationSyncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 2000) },
    });
    return { jobId: job.id, status: "FAILED", result: null, error: message };
  }
}

/** Recent sync history for the settings page (tenant-scoped). */
export async function recentSyncJobs(tenantId: string, provider: string, take = 20) {
  return prisma.integrationSyncJob.findMany({
    where: { tenantId, provider },
    orderBy: { startedAt: "desc" },
    take,
  });
}
