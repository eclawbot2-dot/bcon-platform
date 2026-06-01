/**
 * Xero integration — connect, sync journal entries, ingest historical
 * income statements, and allocate each journal row to a project.
 *
 * In production: OAuth2 with Xero (client credentials / refresh token
 * pattern), pull `/api/xro/2.0/ManualJournals` + `/api/xro/2.0/Reports`
 * endpoints, and post back Tracking Categories for per-project
 * allocation. Here we simulate the same pipeline with deterministic
 * seed data so every downstream report has something real to render.
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  CostReconciliationStatus,
  JournalEntryType,
  XeroConnectionStatus,
} from "@prisma/client";
import { sumMoney, toNum } from "@/lib/money";
import { approvedCoValue } from "@/lib/change-order-totals";

export async function connectXeroDemo(tenantId: string) {
  const existing = await prisma.xeroConnection.findUnique({ where: { tenantId } });
  const data = {
    xeroTenantId: "xero-demo-tenant",
    organizationName: "Demo · Xero sandbox",
    status: XeroConnectionStatus.CONNECTED,
    accessToken: "demo-access-token",
    refreshToken: "demo-refresh-token",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    scopes: "accounting.transactions accounting.reports.read",
    connectedAt: new Date(),
    lastSyncedAt: null,
    lastSyncNote: null,
  };
  if (existing) {
    await prisma.xeroConnection.update({ where: { tenantId }, data });
  } else {
    await prisma.xeroConnection.create({ data: { tenantId, ...data } });
  }
  return { ok: true };
}

export async function disconnectXero(tenantId: string) {
  await prisma.xeroConnection.upsert({
    where: { tenantId },
    update: { status: XeroConnectionStatus.DISCONNECTED, accessToken: null, refreshToken: null, expiresAt: null, lastSyncNote: "disconnected by user" },
    create: { tenantId, status: XeroConnectionStatus.DISCONNECTED },
  });
}

/** Pull journal + income-statement data from Xero (simulated). */
export async function syncFromXero(tenantId: string): Promise<{ ok: boolean; journals: number; statements: number; note: string }> {
  const conn = await prisma.xeroConnection.findUnique({ where: { tenantId } });
  if (!conn || conn.status !== XeroConnectionStatus.CONNECTED) {
    return { ok: false, journals: 0, statements: 0, note: "Xero not connected" };
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
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0);
    const hash = crypto.createHash("sha256").update(`${tenantId}:${periodStart.toISOString().slice(0, 7)}`).digest();
    const rowCount = 15 + (hash[0] % 10);
    for (let i = 0; i < rowCount; i++) {
      const rng = hash[(i + 1) % hash.length] ?? 13;
      const account = accounts[rng % accounts.length];
      const project = projects.length > 0 && rng % 3 !== 0 ? projects[rng % projects.length] : null;
      const signedAmount = account.journalEntryType === JournalEntryType.REVENUE || account.journalEntryType === JournalEntryType.OTHER_INCOME
        ? (rng * 137 + 800) % 45000 + 5000
        : -(((rng * 71 + 300) % 18000) + 500);
      const entryDate = new Date(periodStart.getTime() + (rng % 28) * 24 * 60 * 60 * 1000);
      const xeroId = `xero-${tenantId}-${periodStart.toISOString().slice(0, 7)}-${i}`;
      const existing = await prisma.journalEntryRow.findUnique({ where: { xeroId } });
      if (existing) continue;
      await prisma.journalEntryRow.create({
        data: {
          tenantId,
          entryDate,
          xeroId,
          reference: `JRN-${xeroId.slice(-6)}`,
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
          source: "xero-sync",
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
        source: "xero-sync",
      },
      update: {
        revenue: rev,
        cogs: cogsAbs,
        grossProfit: gross,
        opex: opexAbs,
        ebitda,
        netIncome: ebitda * 0.88,
      },
    });
    sCount += 1;
  }

  await prisma.xeroConnection.update({
    where: { tenantId },
    data: { lastSyncedAt: new Date(), lastSyncNote: `${jCount} journals · ${sCount} monthly statements` },
  });

  await refreshProjectPnl(tenantId);

  return { ok: true, journals: jCount, statements: sCount, note: `${jCount} journals, ${sCount} statements, P&L refreshed` };
}

export async function ensureChartOfAccounts(tenantId: string) {
  const count = await prisma.chartOfAccount.count({ where: { tenantId } });
  if (count > 0) return;
  const rows: Array<{ code: string; name: string; accountType: string; journalEntryType: JournalEntryType }> = [
    { code: "4010", name: "Contract Revenue", accountType: "REVENUE", journalEntryType: JournalEntryType.REVENUE },
    { code: "4020", name: "Change Order Revenue", accountType: "REVENUE", journalEntryType: JournalEntryType.REVENUE },
    { code: "5010", name: "Direct Labor", accountType: "COGS", journalEntryType: JournalEntryType.COST_OF_GOODS },
    { code: "5020", name: "Direct Materials", accountType: "COGS", journalEntryType: JournalEntryType.COST_OF_GOODS },
    { code: "5030", name: "Subcontracted Costs", accountType: "COGS", journalEntryType: JournalEntryType.COST_OF_GOODS },
    { code: "5040", name: "Equipment Rental", accountType: "COGS", journalEntryType: JournalEntryType.COST_OF_GOODS },
    { code: "5050", name: "Permits & Fees", accountType: "COGS", journalEntryType: JournalEntryType.COST_OF_GOODS },
    { code: "6010", name: "Indirect Field Overhead", accountType: "INDIRECT", journalEntryType: JournalEntryType.INDIRECT_COST },
    { code: "6020", name: "Office Salaries", accountType: "OPEX", journalEntryType: JournalEntryType.OPERATING_EXPENSE },
    { code: "6030", name: "Office Rent", accountType: "OPEX", journalEntryType: JournalEntryType.OPERATING_EXPENSE },
    { code: "6040", name: "Insurance", accountType: "OPEX", journalEntryType: JournalEntryType.OPERATING_EXPENSE },
    { code: "6050", name: "Software & IT", accountType: "OPEX", journalEntryType: JournalEntryType.OPERATING_EXPENSE },
    { code: "7010", name: "Interest Income", accountType: "OTHER", journalEntryType: JournalEntryType.OTHER_INCOME },
    { code: "7020", name: "Interest Expense", accountType: "OTHER", journalEntryType: JournalEntryType.OTHER_EXPENSE },
  ];
  await prisma.chartOfAccount.createMany({
    data: rows.map((r) => ({ tenantId, code: r.code, name: r.name, accountType: r.accountType, journalEntryType: r.journalEntryType })),
  });
}

export function memoFor(accountName: string, seed: number): string {
  const variants: Record<string, string[]> = {
    "Direct Labor": ["Weekly payroll allocation", "OT approval impact", "Crew time-card posting"],
    "Direct Materials": ["Material PO receipt", "Stored materials draw", "Vendor restocking"],
    "Subcontracted Costs": ["Sub invoice approved", "Sub pay app release", "Back-charge correction"],
    "Equipment Rental": ["Monthly rental — excavator", "Weekly rental — compactor", "Rental fuel surcharge"],
    "Permits & Fees": ["Municipal permit fee", "Inspection fee", "ROW permit"],
    "Contract Revenue": ["Pay app release", "Progress billing", "Owner direct pay"],
    "Change Order Revenue": ["Approved CO billing", "Owner change allowance"],
    "Indirect Field Overhead": ["Site office trailer", "Temporary utilities", "Security monitoring"],
    "Office Salaries": ["Office payroll", "Executive payroll"],
    "Office Rent": ["Monthly office rent"],
    "Insurance": ["GL premium installment", "Workers comp premium"],
    "Software & IT": ["Project management platform", "Accounting software"],
    "Interest Income": ["Operating account interest"],
    "Interest Expense": ["LOC draw interest"],
  };
  const list = variants[accountName] ?? ["Journal posting"];
  return list[seed % list.length];
}

export function vendorFor(accountName: string, seed: number): string | null {
  if (accountName === "Subcontracted Costs") return ["Coastal Concrete Co", "Atlantic Underground LLC", "Palmetto Steel Erectors"][seed % 3];
  if (accountName === "Direct Materials") return ["Builder's Supply Co", "Lowcountry Lumber", "Charleston Rebar"][seed % 3];
  if (accountName === "Equipment Rental") return ["Sunbelt Rentals", "United Rentals", "Herc Rentals"][seed % 3];
  if (accountName === "Office Rent") return "Charleston Commercial Realty";
  if (accountName === "Software & IT") return "bcon Platform";
  return null;
}

/** Recompute the per-project P&L snapshot from the latest journal + contract data. */
export async function refreshProjectPnl(tenantId: string) {
  const projects = await prisma.project.findMany({ where: { tenantId } });
  for (const project of projects) {
    const contracts = await prisma.contract.findMany({ where: { projectId: project.id }, include: { commitments: true, payApplications: true } });
    const changeOrders = await prisma.changeOrder.findMany({ where: { projectId: project.id } });
    const journals = await prisma.journalEntryRow.findMany({ where: { projectId: project.id } });

    const contractValue = sumMoney(contracts.filter((c) => c.type === "PRIME_OWNER").map((c) => c.originalValue)) || toNum(project.contractValue);
    const approvedCOValue = approvedCoValue(changeOrders);
    const totalContractValue = contractValue + approvedCOValue;
    const billedToDate = sumMoney(contracts.flatMap((c) => c.payApplications).map((p) => p.workCompletedToDate));
    const costsToDate = Math.abs(sumMoney(journals.filter((j) => j.entryType === "COST_OF_GOODS").map((j) => j.amount)));
    const committedCost = sumMoney(contracts.flatMap((c) => c.commitments).map((c) => c.committedAmount));
    const percentComplete = totalContractValue > 0 ? Math.min(100, (billedToDate / totalContractValue) * 100) : 0;
    const forecastFinalCost = costsToDate + Math.max(0, committedCost - costsToDate);
    const forecastGrossMargin = totalContractValue - forecastFinalCost;
    const earnedRevenue = (percentComplete / 100) * totalContractValue;
    const wipOverUnder = billedToDate - earnedRevenue;

    await prisma.projectPnlSnapshot.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        contractValue,
        approvedCOValue,
        totalContractValue,
        billedToDate,
        costsToDate,
        committedCost,
        forecastFinalCost,
        forecastGrossMargin,
        percentComplete,
        wipOverUnder,
        lastReconciledAt: new Date(),
      },
      update: {
        contractValue,
        approvedCOValue,
        totalContractValue,
        billedToDate,
        costsToDate,
        committedCost,
        forecastFinalCost,
        forecastGrossMargin,
        percentComplete,
        wipOverUnder,
        lastReconciledAt: new Date(),
      },
    });
  }
}

/** Suggest project allocation for a journal row using memo keywords + vendor match. */
export function suggestProjectAllocation(memo: string, vendor: string | null | undefined, projects: Array<{ id: string; code: string; name: string; mode: string; ownerName?: string | null }>): { projectId: string | null; confidence: number; reason: string } {
  const normalized = (memo + " " + (vendor ?? "")).toLowerCase();
  let best: { id: string; score: number; reason: string } | null = null;
  for (const p of projects) {
    const codeHit = normalized.includes(p.code.toLowerCase()) ? 40 : 0;
    const nameHit = p.name && normalized.includes(p.name.toLowerCase().split(" ")[0]) ? 25 : 0;
    const ownerHit = p.ownerName ? normalized.includes(p.ownerName.toLowerCase().split(" ")[0]) ? 15 : 0 : 0;
    const modeHit = (p.mode === "HEAVY_CIVIL" && /utility|water|sewer|roadway|paving|bridge/.test(normalized)) ? 20 : (p.mode === "VERTICAL" && /concrete|steel|curtain|mep|rough-in/.test(normalized)) ? 20 : (p.mode === "SIMPLE" && /remodel|finish|cabinet|tile|kitchen/.test(normalized)) ? 20 : 0;
    const score = codeHit + nameHit + ownerHit + modeHit;
    if (score === 0) continue;
    const reason = [codeHit && "code match", nameHit && "name match", ownerHit && "owner match", modeHit && "mode keyword"].filter(Boolean).join(", ");
    if (!best || score > best.score) best = { id: p.id, score, reason };
  }
  if (!best) return { projectId: null, confidence: 0, reason: "no signal" };
  return { projectId: best.id, confidence: Math.min(95, best.score), reason: best.reason };
}
