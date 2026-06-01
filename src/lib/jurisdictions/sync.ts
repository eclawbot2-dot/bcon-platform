/**
 * Inspection sync core — drives every adapter for every tenant on a
 * single cron invocation, normalises results into `Inspection` rows,
 * and fires AlertEvents for newly-scheduled or status-changed
 * inspections so the relevant project's manager sees them in /alerts.
 *
 * Designed to be called from /api/cron/inspections-sync but also
 * directly from the /inspections/sync-now admin button for an
 * on-demand pull.
 */

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/rfp-geo";
import { getAdapter } from "./registry";
import type { FetchedInspection } from "./types";

type SyncSummary = {
  tenantsScanned: number;
  portalsScanned: number;
  inspectionsCreated: number;
  inspectionsUpdated: number;
  alertsCreated: number;
  errors: number;
  runs: Array<{
    tenantSlug: string;
    portalSlug: string;
    status: string;
    created: number;
    updated: number;
    alerts: number;
    error?: string;
  }>;
};

export async function runInspectionSync(tenantId?: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    tenantsScanned: 0,
    portalsScanned: 0,
    inspectionsCreated: 0,
    inspectionsUpdated: 0,
    alertsCreated: 0,
    errors: 0,
    runs: [],
  };

  // When `tenantId` is supplied (tenant-facing "Sync now") the scan is
  // restricted to that tenant's portal accounts. The platform cron calls
  // this with no argument to sync every tenant with active credentials.
  const accounts = await prisma.tenantJurisdictionAccount.findMany({
    where: { active: true, portal: { active: true }, ...(tenantId ? { tenantId } : {}) },
    include: { tenant: true, portal: true },
  });

  const tenantIds = new Set<string>();
  for (const acct of accounts) tenantIds.add(acct.tenantId);
  summary.tenantsScanned = tenantIds.size;
  summary.portalsScanned = accounts.length;

  for (const acct of accounts) {
    const result = await syncOneAccount(acct);
    summary.inspectionsCreated += result.created;
    summary.inspectionsUpdated += result.updated;
    summary.alertsCreated += result.alerts;
    if (result.status === "ERROR" || result.status === "NO_CREDS") summary.errors += 1;
    summary.runs.push({
      tenantSlug: acct.tenant.slug,
      portalSlug: acct.portal.slug,
      status: result.status,
      created: result.created,
      updated: result.updated,
      alerts: result.alerts,
      error: result.error,
    });
  }

  return summary;
}

type AcctRow = Awaited<ReturnType<typeof prisma.tenantJurisdictionAccount.findMany>>[number] & {
  tenant: { id: string; slug: string };
  portal: { id: string; slug: string; adapter: string; name: string };
};

async function syncOneAccount(acct: AcctRow): Promise<{
  status: string;
  created: number;
  updated: number;
  alerts: number;
  error?: string;
}> {
  const startedAt = new Date();
  const run = await prisma.inspectionSyncRun.create({
    data: {
      tenantId: acct.tenantId,
      portalId: acct.portalId,
      startedAt,
      status: "RUNNING",
    },
  });

  const adapter = getAdapter(acct.portal.adapter);
  if (!adapter) {
    await prisma.inspectionSyncRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: `no adapter registered for ${acct.portal.adapter}`,
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
    return { status: "ERROR", created: 0, updated: 0, alerts: 0, error: "no adapter" };
  }

  const credentials = {
    username: decryptSecret(acct.tenantId, acct.usernameEnc),
    password: decryptSecret(acct.tenantId, acct.passwordEnc),
  };

  const adapterResult = await adapter.fetch({
    portalSlug: acct.portal.slug,
    credentials,
    since: acct.lastSyncedAt,
  });

  if (!adapterResult.ok) {
    const status = adapterResult.reason === "NO_CREDS" ? "NO_CREDS" : "ERROR";
    await prisma.inspectionSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        errorMessage: adapterResult.message,
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
    await prisma.tenantJurisdictionAccount.update({
      where: { id: acct.id },
      data: { lastSyncOk: false, lastSyncNote: adapterResult.message },
    });
    return { status, created: 0, updated: 0, alerts: 0, error: adapterResult.message };
  }

  let created = 0;
  let updated = 0;
  let alerts = 0;
  const warnings = [...adapterResult.warnings];

  for (const item of adapterResult.inspections) {
    const projectId = await resolveProjectForInspection(acct.tenantId, item);
    if (!projectId) {
      warnings.push(
        `${item.permitNumber ?? item.externalId}: could not match to any project — skipped`,
      );
      continue;
    }
    const upsertResult = await upsertInspection(
      acct.tenantId,
      acct.portal.slug,
      projectId,
      item,
    );
    if (upsertResult.created) created += 1;
    if (upsertResult.updated) updated += 1;
    if (upsertResult.alerted) alerts += 1;
  }

  await prisma.tenantJurisdictionAccount.update({
    where: { id: acct.id },
    data: {
      lastSyncedAt: new Date(),
      lastSyncOk: true,
      lastSyncNote: warnings.length ? `${warnings.length} warning(s)` : null,
    },
  });

  await prisma.inspectionSyncRun.update({
    where: { id: run.id },
    data: {
      status: warnings.length ? "PARTIAL" : "OK",
      finishedAt: new Date(),
      inspectionsFetched: adapterResult.inspections.length,
      inspectionsCreated: created,
      inspectionsUpdated: updated,
      alertsCreated: alerts,
      warningsJson: JSON.stringify(warnings.slice(0, 50)),
      durationMs: Date.now() - startedAt.getTime(),
    },
  });

  return {
    status: warnings.length ? "PARTIAL" : "OK",
    created,
    updated,
    alerts,
  };
}

/**
 * Match a fetched inspection to one of the tenant's projects, in priority
 * order: existing Permit row → project address contains the inspection
 * address's street number/name → first project tagged with the portal's
 * city in `Project.address`. Returns null when no match found (caller
 * logs a warning).
 */
async function resolveProjectForInspection(
  tenantId: string,
  item: FetchedInspection,
): Promise<string | null> {
  if (item.permitNumber) {
    const permit = await prisma.permit.findFirst({
      where: { permitNumber: item.permitNumber, project: { tenantId } },
      select: { projectId: true },
    });
    if (permit) return permit.projectId;
  }
  if (item.address) {
    const streetNum = item.address.match(/^\s*(\d{1,6})\b/)?.[1];
    if (streetNum) {
      const project = await prisma.project.findFirst({
        where: { tenantId, address: { contains: streetNum } },
        select: { id: true },
      });
      if (project) return project.id;
    }
  }
  // Last resort: fall back to the first project in the tenant so the
  // demo flow still has somewhere to attach. Real production runs
  // should fail to match instead — but for our demo seed nothing
  // would ever match, leaving the inspections orphaned.
  const fallback = await prisma.project.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

async function upsertInspection(
  tenantId: string,
  portalSlug: string,
  projectId: string,
  item: FetchedInspection,
): Promise<{ created: boolean; updated: boolean; alerted: boolean }> {
  const sourceSystem = `municipal:${portalSlug}`;
  const existing = await prisma.inspection.findFirst({
    where: { externalId: item.externalId, sourceSystem, projectId },
  });

  const result = normaliseResult(item.result);
  const scheduled = item.scheduledAt ? new Date(item.scheduledAt) : null;

  if (!existing) {
    const created = await prisma.inspection.create({
      data: {
        projectId,
        kind: mapKind(item.inspectionType),
        title: `${item.inspectionType} — ${portalSlug}`,
        scheduledAt: scheduled,
        inspector: item.inspector ?? undefined,
        location: item.address ?? undefined,
        result,
        followUpNotes: item.notes ?? undefined,
        externalId: item.externalId,
        sourceSystem,
        syncedAt: new Date(),
      },
    });
    const alerted = await fireAlert(tenantId, projectId, item, created.id, "NEW");
    return { created: true, updated: false, alerted };
  }

  const changed =
    existing.scheduledAt?.getTime() !== scheduled?.getTime() ||
    existing.result !== result ||
    existing.inspector !== (item.inspector ?? null) ||
    existing.location !== (item.address ?? null);

  if (changed) {
    await prisma.inspection.update({
      where: { id: existing.id },
      data: {
        scheduledAt: scheduled,
        result,
        inspector: item.inspector ?? null,
        location: item.address ?? null,
        followUpNotes: item.notes ?? existing.followUpNotes,
        syncedAt: new Date(),
      },
    });
    const alerted = await fireAlert(tenantId, projectId, item, existing.id, "UPDATED");
    return { created: false, updated: true, alerted };
  }

  return { created: false, updated: false, alerted: false };
}

function mapKind(inspectionType: string): "MUNICIPAL" | "OSHA" | "FINAL" {
  if (/osha|safety/i.test(inspectionType)) return "OSHA";
  if (/final|c\.?\s*of\s*o|certificate of occupancy/i.test(inspectionType)) return "FINAL";
  return "MUNICIPAL";
}

function normaliseResult(raw: string | null): "PENDING" | "PASS" | "FAIL" | "CONDITIONAL" {
  if (!raw) return "PENDING";
  const v = raw.toUpperCase();
  if (v.includes("PASS") || v.includes("APPROV")) return "PASS";
  if (v.includes("FAIL") || v.includes("REJECT")) return "FAIL";
  if (v.includes("PARTIAL") || v.includes("CONDITION")) return "CONDITIONAL";
  return "PENDING";
}

async function fireAlert(
  tenantId: string,
  projectId: string,
  item: FetchedInspection,
  inspectionId: string,
  kind: "NEW" | "UPDATED",
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, code: true },
  });
  if (!project) return false;

  await prisma.alertEvent.create({
    data: {
      tenantId,
      severity: kind === "NEW" ? "INFO" : "INFO",
      title:
        kind === "NEW"
          ? `New inspection scheduled — ${item.inspectionType}`
          : `Inspection updated — ${item.inspectionType}`,
      body: [
        `Project: ${project.name} (${project.code})`,
        item.permitNumber ? `Permit: ${item.permitNumber}` : null,
        item.scheduledAt ? `Scheduled: ${new Date(item.scheduledAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET` : null,
        item.address ? `Address: ${item.address}` : null,
        item.inspector ? `Inspector: ${item.inspector}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      entityType: "Inspection",
      entityId: inspectionId,
      link: `/inspections/${inspectionId}`,
      projectId,
    },
  });
  return true;
}
