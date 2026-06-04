/**
 * Per-tenant backup.
 *
 * The host runs on Windows + SQLite + Cloudflare tunnel; off-machine
 * disaster recovery isn't built into the storage layer. This module gives
 * each tenant a nightly self-contained JSON dump of its data graph,
 * written to a local backups directory and (optionally) mirrored to a
 * OneDrive / Google Drive sync folder configured per tenant.
 *
 * Why JSON-per-tenant rather than copying dev.db wholesale:
 *   1. dev.db carries every tenant's data, so a single file can't
 *      satisfy "per-tenant" backup destinations.
 *   2. JSON is portable across SQLite ↔ Postgres if the host ever moves.
 *   3. Restoring a single tenant from a multi-tenant dump is painful
 *      with raw SQL but trivial with an upsert loop over JSON.
 *
 * Caveats:
 *   - This is a logical export, not a physical replica. Foreign keys are
 *     captured by the row id columns; restore must walk the dependency
 *     graph in order.
 *   - File contents stored via the storage adapter (HistoricalImport.fileUrl,
 *     candidate resumes, etc.) are NOT included — paths only. The
 *     destination filesystem already syncs the storage root if the user
 *     has set their OneDrive folder at the workspace level.
 *   - Encryption is not applied here. If the destination requires
 *     encryption-at-rest beyond what OneDrive/GDrive provide, wrap the
 *     write step with a tenant-key envelope (TODO).
 */

import { mkdir, writeFile, copyFile, stat, readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type TenantBackupResult = {
  tenantId: string;
  tenantSlug: string;
  ok: boolean;
  bytes?: number;
  localPath?: string;
  externalPath?: string;
  rows?: Record<string, number>;
  error?: string;
};

/**
 * Dump one tenant's data graph to JSON. Returns the byte size and the
 * paths written. Never throws — errors are returned in the result so the
 * caller can keep iterating other tenants.
 */
export async function backupTenant(tenantId: string): Promise<TenantBackupResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return { tenantId, tenantSlug: "?", ok: false, error: "tenant not found" };
  }
  if (!tenant.backupEnabled) {
    return { tenantId, tenantSlug: tenant.slug, ok: false, error: "backups disabled for this tenant" };
  }

  try {
    const data = await collectTenantData(tenantId);
    const rowCounts = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : v == null ? 0 : 1]),
    );

    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10);
    const filename = `${yyyymmdd}.json`;
    const localDir = path.join(process.cwd(), "uploads", "backups", tenant.slug);
    const localPath = path.join(localDir, filename);

    const payload = JSON.stringify(
      {
        meta: {
          tenantId,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          generatedAt: today.toISOString(),
          schemaVersion: 1,
        },
        rowCounts,
        data,
      },
      (_key, v) => (v instanceof Date ? v.toISOString() : v),
      2,
    );

    await mkdir(localDir, { recursive: true });
    await writeFile(localPath, payload);

    let externalPath: string | undefined;
    if (tenant.backupDirectory) {
      try {
        await mkdir(tenant.backupDirectory, { recursive: true });
        externalPath = path.join(tenant.backupDirectory, filename);
        await copyFile(localPath, externalPath);
      } catch (err) {
        console.error(`[backup] external copy failed for tenant ${tenant.slug}`, err);
        externalPath = undefined;
      }
    }

    const fileStat = await stat(localPath);

    // Integrity check — read the freshly-written file back and verify
    // it parses as JSON and contains the top-level keys we just
    // emitted. Catches silent truncation, disk-full at flush, or
    // encoding corruption that would otherwise produce a "successful"
    // backup that's actually unrestorable. If the file is bad we
    // record an error rather than declare success.
    try {
      const verification = await readFile(localPath, "utf8");
      verifyBackupContents(verification);
    } catch (verifyErr) {
      const message = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { lastBackupError: `integrity check failed: ${message}`.slice(0, 500), lastBackupAt: today },
      });
      return { tenantId, tenantSlug: tenant.slug, ok: false, error: `integrity check: ${message}` };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { lastBackupAt: today, lastBackupBytes: fileStat.size, lastBackupError: null },
    });

    return {
      tenantId,
      tenantSlug: tenant.slug,
      ok: true,
      bytes: fileStat.size,
      localPath,
      externalPath,
      rows: rowCounts,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { lastBackupError: message.slice(0, 500), lastBackupAt: new Date() },
    }).catch(() => {});
    return { tenantId, tenantSlug: tenant.slug, ok: false, error: message };
  }
}

/**
 * Validate that a backup file's contents parse as JSON and have the
 * expected shape. Throws on any failure with a specific message that
 * surfaces on the tenant's lastBackupError. Pulled out as a pure
 * function so tests can exercise the parsing logic without spinning
 * up the whole backup machinery.
 */
export function verifyBackupContents(payload: string): void {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  // NOTE: must match the shape emitted by backupTenant(), which writes
  // { meta, rowCounts, data }. The earlier version required "tenant",
  // which no real backup file contains — so every genuine backup silently
  // failed its own post-write integrity check and got marked failed.
  const requiredKeys = ["meta", "rowCounts", "data"];
  for (const k of requiredKeys) {
    if (!(k in parsed)) throw new Error(`backup missing top-level key "${k}"`);
  }
  const data = parsed.data;
  if (!data || typeof data !== "object" || Object.keys(data as Record<string, unknown>).length === 0) {
    throw new Error("backup data section is empty");
  }
}

/**
 * Iterate every backupEnabled tenant. Returns one result per tenant.
 */
export async function backupAllTenants(): Promise<TenantBackupResult[]> {
  const tenants = await prisma.tenant.findMany({
    where: { backupEnabled: true },
    select: { id: true },
  });
  const results: TenantBackupResult[] = [];
  for (const t of tenants) {
    results.push(await backupTenant(t.id));
  }
  return results;
}

/**
 * Walk all tenant-scoped collections and emit them in a stable shape.
 * Adding a new tenant-scoped table is a one-line addition here. Order
 * within each collection matches schema declaration order so diffs
 * across nightly snapshots are easy to read.
 */
async function collectTenantData(tenantId: string) {
  const where: Prisma.ProjectWhereInput = { tenantId };
  const projectScope = { project: { tenantId } };

  const [
    tenant,
    businessUnits,
    memberships,
    projects,
    companies,
    contacts,
    workflowTemplates,
    notificationRules,
    historicalEstimates,
    opportunities,
    vendors,
    insuranceCerts,
    rfpSources,
    rfpListings,
    bidDrafts,
    bidDraftSections,
    bidDraftLineItems,
    complianceChecks,
    complianceItems,
    chartOfAccounts,
    financialStatements,
    journalEntries,
    invoiceInbox,
    invoiceInboxMessages,
    alertRules,
    alertEvents,
    historicalImports,
    historicalImportRows,
    aiRuns,
    recordComments,
    candidates,
    jobRequisitions,
    submissions,
    placements,
    commissionRules,
    commissionAccruals,
    captureRecords,
    captureMilestones,
    colorTeamReviews,
    goNoGoDecisions,
    teamingPartners,
    onboardingPaths,
    onboardingSteps,
    bidProfile,
    auditEvents,
    threads,
    threadMessages,
    tasks,
    rfis,
    submittals,
    documents,
    drawings,
    drawingSheets,
    specSections,
    dailyLogs,
    crewAssignments,
    productionEntries,
    quantities,
    tickets,
    safetyIncidents,
    punchItems,
    meetings,
    inspections,
    inspectionChecklistItems,
    inspectionAttachments,
    permits,
    contracts,
    contractCommitments,
    payApplications,
    payApplicationLines,
    lienWaivers,
    changeOrders,
    changeOrderLines,
    purchaseOrders,
    subInvoices,
    timeEntries,
    timeEntryComments,
    bidPackages,
    subBids,
    warrantyItems,
    workflowRuns,
    watchers,
    approvalRoutes,
    approvals,
    equipmentRecords,
    materialRecords,
    scheduleTasks,
    scheduleDependencies,
    budgets,
    budgetLines,
    revenueProjections,
    pnlSnapshots,
  ] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.businessUnit.findMany({ where: { tenantId } }),
    prisma.membership.findMany({ where: { tenantId } }),
    prisma.project.findMany({ where }),
    prisma.company.findMany({ where: { tenantId } }),
    prisma.contact.findMany({ where: { tenantId } }),
    prisma.workflowTemplate.findMany({ where: { tenantId } }),
    prisma.notificationRule.findMany({ where: { tenantId } }),
    prisma.historicalEstimate.findMany({ where: { tenantId } }),
    prisma.opportunity.findMany({ where: { tenantId } }),
    prisma.vendor.findMany({ where: { tenantId } }),
    prisma.insuranceCert.findMany({ where: { vendor: { tenantId } } }),
    prisma.rfpSource.findMany({ where: { tenantId } }),
    prisma.rfpListing.findMany({ where: { tenantId } }),
    prisma.bidDraft.findMany({ where: { tenantId } }),
    prisma.bidDraftSection.findMany({ where: { draft: { tenantId } } }),
    prisma.bidDraftLineItem.findMany({ where: { draft: { tenantId } } }),
    prisma.complianceCheck.findMany({ where: { draft: { tenantId } } }),
    prisma.complianceItem.findMany({ where: { run: { draft: { tenantId } } } }),
    prisma.chartOfAccount.findMany({ where: { tenantId } }),
    prisma.financialStatement.findMany({ where: { tenantId } }),
    prisma.journalEntryRow.findMany({ where: { tenantId } }),
    prisma.invoiceInboxConnection.findMany({ where: { tenantId } }),
    prisma.invoiceInboxMessage.findMany({ where: { tenantId } }),
    prisma.alertRule.findMany({ where: { tenantId } }),
    prisma.alertEvent.findMany({ where: { tenantId } }),
    prisma.historicalImport.findMany({ where: { tenantId } }),
    prisma.historicalImportRow.findMany({ where: { import: { tenantId } } }),
    prisma.aiRunLog.findMany({ where: { tenantId } }),
    prisma.recordComment.findMany({ where: { tenantId } }),
    prisma.candidate.findMany({ where: { tenantId } }),
    prisma.jobRequisition.findMany({ where: { tenantId } }),
    prisma.submission.findMany({ where: { tenantId } }),
    prisma.placement.findMany({ where: { tenantId } }),
    prisma.commissionRule.findMany({ where: { tenantId } }),
    prisma.commissionAccrual.findMany({ where: { tenantId } }),
    prisma.captureRecord.findMany({ where: { tenantId } }),
    prisma.captureMilestone.findMany({ where: { capture: { tenantId } } }),
    prisma.colorTeamReview.findMany({ where: { capture: { tenantId } } }),
    prisma.goNoGoDecision.findMany({ where: { capture: { tenantId } } }),
    prisma.teamingPartner.findMany({ where: { capture: { tenantId } } }),
    prisma.onboardingPath.findMany({ where: { tenantId } }),
    prisma.onboardingStep.findMany({ where: { path: { tenantId } } }),
    prisma.tenantBidProfile.findMany({ where: { tenantId } }),
    prisma.auditEvent.findMany({ where: { tenantId } }),
    prisma.thread.findMany({ where: projectScope }),
    prisma.threadMessage.findMany({ where: { thread: projectScope } }),
    prisma.task.findMany({ where: projectScope }),
    prisma.rFI.findMany({ where: projectScope }),
    prisma.submittal.findMany({ where: projectScope }),
    prisma.document.findMany({ where: projectScope }),
    prisma.drawing.findMany({ where: projectScope }),
    prisma.drawingSheet.findMany({ where: { drawing: projectScope } }),
    prisma.specSection.findMany({ where: projectScope }),
    prisma.dailyLog.findMany({ where: projectScope }),
    prisma.crewAssignment.findMany({ where: projectScope }),
    prisma.productionEntry.findMany({ where: projectScope }),
    prisma.quantityBudget.findMany({ where: projectScope }),
    prisma.ticket.findMany({ where: projectScope }),
    prisma.safetyIncident.findMany({ where: projectScope }),
    prisma.punchItem.findMany({ where: projectScope }),
    prisma.meeting.findMany({ where: projectScope }),
    prisma.inspection.findMany({ where: projectScope }),
    prisma.inspectionChecklistItem.findMany({ where: { inspection: projectScope } }),
    prisma.inspectionAttachment.findMany({ where: { inspection: projectScope } }),
    prisma.permit.findMany({ where: projectScope }),
    prisma.contract.findMany({ where: projectScope }),
    prisma.contractCommitment.findMany({ where: { contract: projectScope } }),
    prisma.payApplication.findMany({ where: projectScope }),
    prisma.payApplicationLine.findMany({ where: { payApplication: projectScope } }),
    prisma.lienWaiver.findMany({ where: projectScope }),
    prisma.changeOrder.findMany({ where: projectScope }),
    prisma.changeOrderLine.findMany({ where: { changeOrder: projectScope } }),
    prisma.purchaseOrder.findMany({ where: projectScope }),
    prisma.subInvoice.findMany({ where: projectScope }),
    prisma.timeEntry.findMany({ where: projectScope }),
    prisma.timeEntryComment.findMany({ where: { entry: projectScope } }),
    prisma.bidPackage.findMany({ where: projectScope }),
    prisma.subBid.findMany({ where: { bidPackage: projectScope } }),
    prisma.warrantyItem.findMany({ where: projectScope }),
    prisma.workflowRun.findMany({ where: projectScope }),
    prisma.watcher.findMany({ where: projectScope }),
    prisma.approvalRoute.findMany({ where: projectScope }),
    prisma.approval.findMany({ where: { tenantId } }),
    prisma.equipmentRecord.findMany({ where: projectScope }),
    prisma.materialRecord.findMany({ where: projectScope }),
    prisma.scheduleTask.findMany({ where: projectScope }),
    prisma.scheduleDependency.findMany({ where: { predecessor: projectScope } }),
    prisma.budget.findMany({ where: projectScope }),
    prisma.budgetLine.findMany({ where: { budget: projectScope } }),
    prisma.revenueProjection.findMany({ where: projectScope }),
    prisma.projectPnlSnapshot.findMany({ where: projectScope }),
  ]);

  return {
    tenant,
    businessUnits,
    memberships,
    projects,
    companies,
    contacts,
    workflowTemplates,
    notificationRules,
    historicalEstimates,
    opportunities,
    vendors,
    insuranceCerts,
    rfpSources,
    rfpListings,
    bidDrafts,
    bidDraftSections,
    bidDraftLineItems,
    complianceChecks,
    complianceItems,
    chartOfAccounts,
    financialStatements,
    journalEntries,
    invoiceInbox,
    invoiceInboxMessages,
    alertRules,
    alertEvents,
    historicalImports,
    historicalImportRows,
    aiRuns,
    recordComments,
    candidates,
    jobRequisitions,
    submissions,
    placements,
    commissionRules,
    commissionAccruals,
    captureRecords,
    captureMilestones,
    colorTeamReviews,
    goNoGoDecisions,
    teamingPartners,
    onboardingPaths,
    onboardingSteps,
    bidProfile,
    auditEvents,
    threads,
    threadMessages,
    tasks,
    rfis,
    submittals,
    documents,
    drawings,
    drawingSheets,
    specSections,
    dailyLogs,
    crewAssignments,
    productionEntries,
    quantities,
    tickets,
    safetyIncidents,
    punchItems,
    meetings,
    inspections,
    inspectionChecklistItems,
    inspectionAttachments,
    permits,
    contracts,
    contractCommitments,
    payApplications,
    payApplicationLines,
    lienWaivers,
    changeOrders,
    changeOrderLines,
    purchaseOrders,
    subInvoices,
    timeEntries,
    timeEntryComments,
    bidPackages,
    subBids,
    warrantyItems,
    workflowRuns,
    watchers,
    approvalRoutes,
    approvals,
    equipmentRecords,
    materialRecords,
    scheduleTasks,
    scheduleDependencies,
    budgets,
    budgetLines,
    revenueProjections,
    pnlSnapshots,
  };
}

// ===========================================================================
// RESTORE
// ===========================================================================

/**
 * Restore order: each backup `data` collection mapped to its Prisma
 * delegate name, listed in FK-dependency order (parents before children).
 * This mirrors collectTenantData()'s collection order, which is already
 * topological. The tenant row itself is restored first, outside this list.
 *
 * Keeping this as an explicit list (rather than reflecting over the dump)
 * makes the dependency ordering auditable and means an unknown/renamed key
 * fails loudly instead of inserting in the wrong order.
 */
const RESTORE_ORDER: ReadonlyArray<readonly [dataKey: string, delegate: string]> = [
  ["businessUnits", "businessUnit"],
  ["memberships", "membership"],
  ["companies", "company"],
  ["contacts", "contact"],
  ["vendors", "vendor"],
  ["insuranceCerts", "insuranceCert"],
  ["projects", "project"],
  ["workflowTemplates", "workflowTemplate"],
  ["notificationRules", "notificationRule"],
  ["historicalEstimates", "historicalEstimate"],
  ["opportunities", "opportunity"],
  ["rfpSources", "rfpSource"],
  ["rfpListings", "rfpListing"],
  ["bidDrafts", "bidDraft"],
  ["bidDraftSections", "bidDraftSection"],
  ["bidDraftLineItems", "bidDraftLineItem"],
  ["complianceChecks", "complianceCheck"],
  ["complianceItems", "complianceItem"],
  ["chartOfAccounts", "chartOfAccount"],
  ["financialStatements", "financialStatement"],
  ["journalEntries", "journalEntryRow"],
  ["invoiceInbox", "invoiceInboxConnection"],
  ["invoiceInboxMessages", "invoiceInboxMessage"],
  ["alertRules", "alertRule"],
  ["alertEvents", "alertEvent"],
  ["historicalImports", "historicalImport"],
  ["historicalImportRows", "historicalImportRow"],
  ["aiRuns", "aiRunLog"],
  ["recordComments", "recordComment"],
  ["candidates", "candidate"],
  ["jobRequisitions", "jobRequisition"],
  ["submissions", "submission"],
  ["placements", "placement"],
  ["commissionRules", "commissionRule"],
  ["commissionAccruals", "commissionAccrual"],
  ["captureRecords", "captureRecord"],
  ["captureMilestones", "captureMilestone"],
  ["colorTeamReviews", "colorTeamReview"],
  ["goNoGoDecisions", "goNoGoDecision"],
  ["teamingPartners", "teamingPartner"],
  ["onboardingPaths", "onboardingPath"],
  ["onboardingSteps", "onboardingStep"],
  ["bidProfile", "tenantBidProfile"],
  ["auditEvents", "auditEvent"],
  ["threads", "thread"],
  ["threadMessages", "threadMessage"],
  ["tasks", "task"],
  ["rfis", "rFI"],
  ["submittals", "submittal"],
  ["documents", "document"],
  ["drawings", "drawing"],
  ["drawingSheets", "drawingSheet"],
  ["specSections", "specSection"],
  ["dailyLogs", "dailyLog"],
  ["crewAssignments", "crewAssignment"],
  ["productionEntries", "productionEntry"],
  ["quantities", "quantityBudget"],
  ["tickets", "ticket"],
  ["safetyIncidents", "safetyIncident"],
  ["punchItems", "punchItem"],
  ["meetings", "meeting"],
  ["inspections", "inspection"],
  ["inspectionChecklistItems", "inspectionChecklistItem"],
  ["inspectionAttachments", "inspectionAttachment"],
  ["permits", "permit"],
  ["contracts", "contract"],
  ["contractCommitments", "contractCommitment"],
  ["payApplications", "payApplication"],
  ["payApplicationLines", "payApplicationLine"],
  ["lienWaivers", "lienWaiver"],
  ["changeOrders", "changeOrder"],
  ["changeOrderLines", "changeOrderLine"],
  ["purchaseOrders", "purchaseOrder"],
  ["subInvoices", "subInvoice"],
  ["timeEntries", "timeEntry"],
  ["timeEntryComments", "timeEntryComment"],
  ["bidPackages", "bidPackage"],
  ["subBids", "subBid"],
  ["warrantyItems", "warrantyItem"],
  ["workflowRuns", "workflowRun"],
  ["watchers", "watcher"],
  ["approvalRoutes", "approvalRoute"],
  ["approvals", "approval"],
  ["equipmentRecords", "equipmentRecord"],
  ["materialRecords", "materialRecord"],
  ["scheduleTasks", "scheduleTask"],
  ["scheduleDependencies", "scheduleDependency"],
  ["budgets", "budget"],
  ["budgetLines", "budgetLine"],
  ["revenueProjections", "revenueProjection"],
  ["pnlSnapshots", "projectPnlSnapshot"],
];

// ISO-8601 datetime detector. The backup serializer writes Date columns as
// ISO strings (so the JSON is portable), but Prisma's createMany expects
// Date objects for DateTime fields — so we coerce matching strings back.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function coerceRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && ISO_DATETIME.test(v)) {
      const d = new Date(v);
      out[k] = Number.isNaN(d.getTime()) ? v : d;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export type RestoreTenantOptions = {
  /**
   * Authorization gate. restoreTenant is destructive (it writes a whole
   * tenant graph) and MUST be super-admin only. The caller passes the
   * result of a super-admin check; restore refuses to run when false.
   */
  isSuperAdmin: boolean;
  /**
   * Dry-run (default true). When true, validate + report planned row
   * counts WITHOUT writing anything. The caller must explicitly pass
   * `confirm: true` (and dryRun: false) to actually write.
   */
  dryRun?: boolean;
  /** Must be true to perform a real write. Belt-and-suspenders with dryRun. */
  confirm?: boolean;
};

export type RestoreTenantResult = {
  ok: boolean;
  dryRun: boolean;
  tenantId?: string;
  tenantSlug?: string;
  planned: Record<string, number>;
  restored?: Record<string, number>;
  error?: string;
};

/**
 * Restore one tenant's data graph from a backup JSON payload (the string
 * written by backupTenant). Walks RESTORE_ORDER (FK dependency order),
 * inserting with skipDuplicates so a partial-overlap restore is safe.
 *
 *   - Super-admin gated (opts.isSuperAdmin).
 *   - Defaults to dry-run: returns planned counts and writes nothing unless
 *     the caller passes { dryRun: false, confirm: true }.
 *   - The whole write runs in a transaction so a mid-restore failure rolls
 *     back rather than leaving a half-restored tenant.
 *
 * Returns a result object (never throws for expected failures like bad
 * payload / not authorized); unexpected DB errors propagate the transaction
 * rollback into result.error.
 */
export async function restoreTenant(payload: string, opts: RestoreTenantOptions): Promise<RestoreTenantResult> {
  const dryRun = opts.dryRun !== false; // default true

  if (!opts.isSuperAdmin) {
    return { ok: false, dryRun, planned: {}, error: "restore requires super-admin" };
  }

  // Validate shape (throws → caught) before doing anything.
  try {
    verifyBackupContents(payload);
  } catch (err) {
    return { ok: false, dryRun, planned: {}, error: `invalid backup: ${err instanceof Error ? err.message : String(err)}` };
  }

  const parsed = JSON.parse(payload) as {
    meta?: { tenantId?: string; tenantSlug?: string };
    data: Record<string, unknown>;
  };
  const data = parsed.data;
  const tenantRow = data.tenant as Record<string, unknown> | null | undefined;
  if (!tenantRow || typeof tenantRow !== "object") {
    return { ok: false, dryRun, planned: {}, error: "backup data.tenant missing" };
  }

  // Plan: count rows per collection.
  const planned: Record<string, number> = {};
  planned.tenant = 1;
  for (const [key] of RESTORE_ORDER) {
    const rows = data[key];
    planned[key] = Array.isArray(rows) ? rows.length : 0;
  }

  if (dryRun || !opts.confirm) {
    return {
      ok: true,
      dryRun: true,
      tenantId: parsed.meta?.tenantId,
      tenantSlug: parsed.meta?.tenantSlug,
      planned,
      error: !dryRun && !opts.confirm ? "confirm:true required to write" : undefined,
    };
  }

  const restored: Record<string, number> = {};
  try {
    await prisma.$transaction(async (tx) => {
      // Upsert the tenant first so all FKs resolve.
      const { id } = tenantRow as { id: string };
      const tenantData = coerceRow(tenantRow as Record<string, unknown>);
      await (tx as unknown as Record<string, { upsert: (a: unknown) => Promise<unknown> }>).tenant.upsert({
        where: { id },
        create: tenantData,
        update: tenantData,
      });
      restored.tenant = 1;

      for (const [key, delegate] of RESTORE_ORDER) {
        const rows = data[key];
        if (!Array.isArray(rows) || rows.length === 0) {
          restored[key] = 0;
          continue;
        }
        const model = (tx as unknown as Record<string, {
          createMany: (a: unknown) => Promise<{ count: number }>;
          findMany: (a: unknown) => Promise<Array<{ id: string }>>;
        }>)[delegate];
        if (!model) throw new Error(`unknown prisma delegate "${delegate}" for backup key "${key}"`);

        let coerced = (rows as Array<Record<string, unknown>>).map(coerceRow);

        // SQLite's createMany does NOT support skipDuplicates, so to stay
        // idempotent we filter out rows whose primary key already exists.
        // Every model in the dump keys on a scalar `id`.
        const ids = coerced.map((r) => r.id).filter((v): v is string => typeof v === "string");
        if (ids.length > 0) {
          const existing = await model.findMany({ where: { id: { in: ids } }, select: { id: true } });
          if (existing.length > 0) {
            const have = new Set(existing.map((e) => e.id));
            coerced = coerced.filter((r) => !(typeof r.id === "string" && have.has(r.id)));
          }
        }

        if (coerced.length === 0) {
          restored[key] = 0;
          continue;
        }
        const res = await model.createMany({ data: coerced });
        restored[key] = res.count;
      }
    });
  } catch (err) {
    return {
      ok: false,
      dryRun: false,
      tenantId: parsed.meta?.tenantId,
      tenantSlug: parsed.meta?.tenantSlug,
      planned,
      error: `restore failed (rolled back): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    dryRun: false,
    tenantId: parsed.meta?.tenantId,
    tenantSlug: parsed.meta?.tenantSlug,
    planned,
    restored,
  };
}
