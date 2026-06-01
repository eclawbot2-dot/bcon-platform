/**
 * QuickBooks Online integration — connect, sync Item/Class-tagged journal
 * entries + monthly P&L reports, project-tag allocations, and delta sync
 * via Intuit's `CDC` (change data capture) endpoint.
 *
 * In production: Intuit OAuth2 (`openid profile email phone address
 * com.intuit.quickbooks.accounting`), call
 *   GET /v3/company/{realmId}/query?query=SELECT * FROM JournalEntry WHERE
 *   MetaData.LastUpdatedTime > '{cursor}'
 * and
 *   GET /v3/company/{realmId}/reports/ProfitAndLoss?start_date&end_date
 * then map Class / Customer:Job / SubCustomer references to bcon projects.
 * Here we simulate the same pipeline against the seeded tenant so the
 * whole workflow (connect → sync → allocate → P&L refresh) works.
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  CostReconciliationStatus,
  JournalEntryType,
  QboConnectionStatus,
} from "@prisma/client";
import { ensureChartOfAccounts, memoFor, vendorFor, refreshProjectPnl } from "@/lib/xero-sync";
import { toNum } from "@/lib/money";

export async function connectQboDemo(tenantId: string) {
  const existing = await prisma.qboConnection.findUnique({ where: { tenantId } });
  const data = {
    realmId: "qbo-demo-realm-" + tenantId.slice(-6),
    organizationName: "Demo · QuickBooks Online sandbox",
    environment: "sandbox",
    status: QboConnectionStatus.CONNECTED,
    accessToken: "demo-qbo-access-token",
    refreshToken: "demo-qbo-refresh-token",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 100),
    scopes: "com.intuit.quickbooks.accounting openid profile email",
    connectedAt: new Date(),
    lastSyncedAt: null,
    lastSyncNote: null,
  };
  if (existing) {
    await prisma.qboConnection.update({ where: { tenantId }, data });
  } else {
    await prisma.qboConnection.create({ data: { tenantId, ...data } });
  }
  return { ok: true };
}

export async function disconnectQbo(tenantId: string) {
  await prisma.qboConnection.upsert({
    where: { tenantId },
    update: { status: QboConnectionStatus.DISCONNECTED, accessToken: null, refreshToken: null, expiresAt: null, lastSyncNote: "disconnected by user" },
    create: { tenantId, status: QboConnectionStatus.DISCONNECTED },
  });
}

/** Pull journal + P&L reports from QBO (simulated). */
export async function syncFromQbo(tenantId: string): Promise<{ ok: boolean; journals: number; statements: number; note: string }> {
  const conn = await prisma.qboConnection.findUnique({ where: { tenantId } });
  if (!conn || conn.status !== QboConnectionStatus.CONNECTED) {
    return { ok: false, journals: 0, statements: 0, note: "QBO not connected" };
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { projects: true } });
  if (!tenant) return { ok: false, journals: 0, statements: 0, note: "tenant not found" };

  await ensureChartOfAccounts(tenantId);

  const accounts = await prisma.chartOfAccount.findMany({ where: { tenantId } });
  const projects = tenant.projects;

  const now = new Date();
  let jCount = 0;
  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const periodStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const hash = crypto.createHash("sha256").update(`${tenantId}:qbo:${periodStart.toISOString().slice(0, 7)}`).digest();
    const rowCount = 14 + (hash[0] % 12);
    for (let i = 0; i < rowCount; i++) {
      const rng = hash[(i + 1) % hash.length] ?? 19;
      const account = accounts[rng % accounts.length];
      const project = projects.length > 0 && rng % 3 !== 0 ? projects[rng % projects.length] : null;
      const signedAmount = account.journalEntryType === JournalEntryType.REVENUE || account.journalEntryType === JournalEntryType.OTHER_INCOME
        ? (rng * 149 + 900) % 48000 + 5500
        : -(((rng * 73 + 260) % 17500) + 600);
      const entryDate = new Date(periodStart.getTime() + (rng % 28) * 24 * 60 * 60 * 1000);
      const qboId = `qbo-${tenantId}-${periodStart.toISOString().slice(0, 7)}-${i}`;
      const existing = await prisma.journalEntryRow.findUnique({ where: { qboId } });
      if (existing) continue;
      await prisma.journalEntryRow.create({
        data: {
          tenantId,
          entryDate,
          qboId,
          externalSource: "quickbooks-online",
          reference: `QBO-${qboId.slice(-6)}`,
          memo: memoFor(account.name, rng),
          accountCode: account.code,
          accountName: account.name,
          entryType: account.journalEntryType,
          amount: signedAmount,
          vendorName: vendorFor(account.name, rng),
          projectId: project?.id ?? null,
          costCode: project && account.journalEntryType === JournalEntryType.COST_OF_GOODS ? (project.mode === "HEAVY_CIVIL" ? "P-014" : "033000") : null,
          allocationConfidence: project ? 60 + (rng % 40) : null,
          reconciliationStatus: project ? (rng % 3 === 0 ? CostReconciliationStatus.CONFIRMED : CostReconciliationStatus.SUGGESTED) : CostReconciliationStatus.UNREVIEWED,
          source: "qbo-sync",
        },
      });
      jCount += 1;
    }
  }

  let sCount = 0;
  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const periodStart = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
    // Exclusive upper bound = first instant of next month, so entries timestamped
    // on the last day with a time component (e.g. receivedAt 2026-01-31T15:00) are
    // not silently dropped. (periodEnd itself is last-day-midnight and must stay so
    // for the persisted record + upsert unique key.)
    const periodEndExclusive = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 1);
    const revenue = await prisma.journalEntryRow.aggregate({ where: { tenantId, entryDate: { gte: periodStart, lt: periodEndExclusive }, entryType: JournalEntryType.REVENUE }, _sum: { amount: true } });
    const cogs = await prisma.journalEntryRow.aggregate({ where: { tenantId, entryDate: { gte: periodStart, lt: periodEndExclusive }, entryType: JournalEntryType.COST_OF_GOODS }, _sum: { amount: true } });
    const opex = await prisma.journalEntryRow.aggregate({ where: { tenantId, entryDate: { gte: periodStart, lt: periodEndExclusive }, entryType: { in: [JournalEntryType.OPERATING_EXPENSE, JournalEntryType.INDIRECT_COST] } }, _sum: { amount: true } });
    const rev = toNum(revenue._sum.amount);
    const cogsAbs = Math.abs(toNum(cogs._sum.amount));
    const opexAbs = Math.abs(toNum(opex._sum.amount));
    const gross = rev - cogsAbs;
    const ebitda = gross - opexAbs;
    await prisma.financialStatement.upsert({
      where: { tenantId_statementType_periodStart_periodEnd: { tenantId, statementType: "INCOME_STATEMENT", periodStart, periodEnd } },
      create: {
        tenantId,
        statementType: "INCOME_STATEMENT",
        periodStart,
        periodEnd,
        revenue: rev,
        cogs: cogsAbs,
        grossProfit: gross,
        opex: opexAbs,
        ebitda,
        netIncome: ebitda * 0.88,
        source: "qbo-sync",
      },
      update: {
        revenue: rev,
        cogs: cogsAbs,
        grossProfit: gross,
        opex: opexAbs,
        ebitda,
        netIncome: ebitda * 0.88,
        source: "qbo-sync",
      },
    });
    sCount += 1;
  }

  await prisma.qboConnection.update({
    where: { tenantId },
    data: { lastSyncedAt: new Date(), lastSyncNote: `${jCount} journals · ${sCount} monthly statements from QuickBooks Online` },
  });

  await refreshProjectPnl(tenantId);

  return { ok: true, journals: jCount, statements: sCount, note: `${jCount} journals from QBO, ${sCount} statements, P&L refreshed` };
}
