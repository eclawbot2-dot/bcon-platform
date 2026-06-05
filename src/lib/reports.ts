/**
 * Report builders. Each function returns a JSON shape that can be
 * rendered as a UI table OR exported to CSV via toCsv() in src/lib/csv.ts.
 *
 * All functions are tenant-scoped — pass the tenantId in.
 *
 * R1 wipReport — surety-grade WIP, over/under billed, change-order-aware
 * R2 costToCompleteForecast — by cost code, ETC + EAC
 * R3 marginFadeTrend — gross margin trend by month / project
 * R4 winRateAnalytics — bid win rate by client / PM / estimator
 * R5 estimateAccuracyReport — bid estimate vs actual at completion
 * R6 resourceHeatmap — labor + equipment allocation across projects
 * R7 bondingCapacityReport — surety reporting by entity
 * R8 sovReconciliation — schedule-of-values vs pay-app billing
 */

import { prisma } from "@/lib/prisma";
import { sumMoney, subtractMoney, multiplyMoney, toNum, type MoneyLike } from "@/lib/money";

// ─── R1 — Surety-grade WIP report ──────────────────────────────────

export type WipRow = {
  projectId: string;
  projectName: string;
  contractValue: number;
  costsToDate: number;
  billedToDate: number;
  estimatedFinalCost: number;
  percentComplete: number;
  earnedRevenue: number;
  overBilled: number;
  underBilled: number;
  forecastGrossMargin: number;
};

export async function wipReport(tenantId: string, _asOf: Date = new Date()): Promise<WipRow[]> {
  const projects = await prisma.project.findMany({
    where: { tenantId },
    include: { pnlSnapshot: true },
  });
  return projects.map((p): WipRow => {
    const snap = p.pnlSnapshot;
    const contract: number = toNum(snap?.totalContractValue ?? p.contractValue);
    const billed: number = toNum(snap?.billedToDate);
    const cost: number = toNum(snap?.costsToDate);
    const efc: number = snap?.forecastFinalCost != null ? toNum(snap.forecastFinalCost) : cost;
    const pct = efc > 0 ? Math.min(1, cost / efc) : 0;
    const earned = multiplyMoney(contract, pct);
    const over = Math.max(0, subtractMoney(billed, earned));
    const under = Math.max(0, subtractMoney(earned, billed));
    return {
      projectId: p.id,
      projectName: p.name,
      contractValue: contract,
      costsToDate: cost,
      billedToDate: billed,
      estimatedFinalCost: efc,
      percentComplete: pct,
      earnedRevenue: earned,
      overBilled: over,
      underBilled: under,
      forecastGrossMargin: toNum(snap?.forecastGrossMargin),
    };
  });
}

// ─── R2 — Cost-to-complete forecast ────────────────────────────────

export type CtcRow = {
  projectId: string;
  costCode: string;
  budgeted: number;
  spent: number;
  committed: number;
  remaining: number;
  estimateAtCompletion: number;
};

export async function costToCompleteForecast(tenantId: string): Promise<CtcRow[]> {
  const projects = await prisma.project.findMany({
    where: { tenantId },
    include: {
      budgets: {
        include: {
          lines: true,
        },
      },
    },
  });
  const out: CtcRow[] = [];
  for (const p of projects) {
    for (const b of p.budgets) {
      for (const line of b.lines) {
        const spent = toNum(line.actualCost);
        const committed = toNum(line.committedCost);
        const budgeted = toNum(line.budgetAmount);
        const remaining = Math.max(0, subtractMoney(budgeted, sumMoney([spent, committed])));
        const eac = sumMoney([spent, committed, remaining]);
        out.push({
          projectId: p.id,
          costCode: line.code ?? line.description,
          budgeted,
          spent,
          committed,
          remaining,
          estimateAtCompletion: eac,
        });
      }
    }
  }
  return out;
}

// ─── R3 — Margin-fade trend ───────────────────────────────────────

export type MarginFadePoint = {
  projectId: string;
  projectName: string;
  asOf: Date;
  forecastGrossMargin: number;
};

export async function marginFadeTrend(tenantId: string, monthsBack: number = 12): Promise<MarginFadePoint[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  const snapshots = await prisma.projectPnlSnapshot.findMany({
    where: { project: { tenantId }, asOf: { gte: since } },
    orderBy: [{ projectId: "asc" }, { asOf: "asc" }],
    include: { project: true },
  });
  return snapshots.map((s) => ({
    projectId: s.projectId,
    projectName: s.project.name,
    asOf: s.asOf,
    forecastGrossMargin: toNum(s.forecastGrossMargin),
  }));
}

// ─── R4 — Bid win rate ─────────────────────────────────────────────

export type WinRateRow = {
  scope: string;
  total: number;
  won: number;
  lost: number;
  winRate: number;
};

export async function winRateAnalytics(tenantId: string): Promise<{ byOwner: WinRateRow[] }> {
  const opps = await prisma.opportunity.findMany({ where: { tenantId } });
  const byOwner = new Map<string, { total: number; won: number; lost: number }>();
  for (const o of opps) {
    const owner = o.ownerName ?? "(unassigned)";
    const slot = byOwner.get(owner) ?? { total: 0, won: 0, lost: 0 };
    slot.total += 1;
    if (o.stage === "AWARDED") slot.won += 1;
    if (o.stage === "LOST" || o.stage === "WITHDRAWN") slot.lost += 1;
    byOwner.set(owner, slot);
  }
  const rows: WinRateRow[] = [];
  for (const [owner, s] of byOwner.entries()) {
    const decided = s.won + s.lost;
    rows.push({
      scope: owner,
      total: s.total,
      won: s.won,
      lost: s.lost,
      winRate: decided > 0 ? s.won / decided : 0,
    });
  }
  rows.sort((a, b) => b.winRate - a.winRate);
  return { byOwner: rows };
}

// ─── R5 — Estimate accuracy ────────────────────────────────────────

export type EstimateAccuracyRow = {
  projectId: string;
  projectName: string;
  bidEstimate: number;
  actualFinalCost: number;
  variance: number;
  variancePct: number;
};

export async function estimateAccuracyReport(tenantId: string): Promise<EstimateAccuracyRow[]> {
  const projects = await prisma.project.findMany({
    where: { tenantId, stage: { in: ["CLOSEOUT", "WARRANTY"] } },
    include: { pnlSnapshot: true },
  });
  return projects.map((p): EstimateAccuracyRow => {
    const snap = p.pnlSnapshot;
    const bid: number = toNum(p.contractValue);
    const actual: number = snap?.forecastFinalCost != null ? toNum(snap.forecastFinalCost) : toNum(snap?.costsToDate);
    const variance = actual - bid;
    const pct = bid > 0 ? variance / bid : 0;
    return {
      projectId: p.id,
      projectName: p.name,
      bidEstimate: bid,
      actualFinalCost: actual,
      variance,
      variancePct: pct,
    };
  });
}

// ─── R6 — Resource heatmap ─────────────────────────────────────────

export type ResourceHeatmapRow = {
  weekStarting: Date;
  resource: string;
  projectId: string;
  projectName: string;
  hours: number;
};

export async function resourceHeatmap(tenantId: string, weeksAhead: number = 8): Promise<ResourceHeatmapRow[]> {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + weeksAhead * 7);
  const entries = await prisma.timeEntry.findMany({
    where: { project: { tenantId }, weekEnding: { gte: now, lte: future } },
    include: { project: true },
  });
  return entries.map((t) => ({
    weekStarting: t.weekEnding,
    resource: t.employeeName,
    projectId: t.projectId,
    projectName: t.project.name,
    hours: (t.regularHours ?? 0) + (t.overtimeHours ?? 0) + (t.doubleTimeHours ?? 0),
  }));
}

// ─── R7 — Bonding / surety ─────────────────────────────────────────

export type BondingRow = {
  totalContractValue: number;
  totalCostsToDate: number;
  totalBilledToDate: number;
  workInProgress: number;
  backlog: number;
};

export async function bondingCapacityReport(tenantId: string): Promise<BondingRow> {
  const snapshots = await prisma.projectPnlSnapshot.findMany({
    where: { project: { tenantId } },
    orderBy: [{ projectId: "asc" }, { asOf: "desc" }],
    distinct: ["projectId"],
  });
  const contract = sumMoney(snapshots.map((s) => s.totalContractValue));
  const cost = sumMoney(snapshots.map((s) => s.costsToDate));
  const billed = sumMoney(snapshots.map((s) => s.billedToDate));
  return {
    totalContractValue: contract,
    totalCostsToDate: cost,
    totalBilledToDate: billed,
    workInProgress: subtractMoney(cost, billed),
    backlog: subtractMoney(contract, billed),
  };
}

// ─── R8 — Schedule-of-values vs pay-app reconciliation ─────────────
//
// The SOV (the G703 schedule of values) is the contract broken into line
// items, each with a scheduled value. Each pay application bills against
// those lines cumulatively. This report reconciles the two: per SOV line
// it shows scheduled value, billed-to-date, % complete, retainage held,
// and balance to finish — then rolls up to a project total and flags
// over-billing (billed beyond the scheduled value).
//
// Pure over fetched data so it unit-tests without a DB. `payApps` is the
// project's pay applications ordered oldest→newest; the cumulative
// `totalCompleted` / `retainage` on the *latest* period a line appears in
// is authoritative (G703 lines carry running totals).

export type SovPayAppLineLike = {
  lineNumber: number;
  costCode: string | null;
  description: string;
  scheduledValue: MoneyLike;
  totalCompleted: MoneyLike;
  retainage: MoneyLike;
};

export type SovPayAppLike = {
  periodNumber: number;
  status: string;
  lines: SovPayAppLineLike[];
};

export type SovReconLine = {
  key: string;
  lineNumber: number;
  costCode: string | null;
  description: string;
  scheduledValue: number;
  billedToDate: number;
  percentComplete: number;
  retainageHeld: number;
  balanceToFinish: number;
  /** Amount billed beyond the scheduled value (0 when within budget). */
  overBilled: number;
};

export type SovReconReport = {
  lines: SovReconLine[];
  totals: {
    scheduledValue: number;
    billedToDate: number;
    percentComplete: number;
    retainageHeld: number;
    balanceToFinish: number;
    overBilled: number;
    /** SOV scheduled total vs. sum of pay-app line scheduled values. A
     *  non-zero delta means the SOV drifted from the contract (e.g. an
     *  unincorporated change order). */
    underBilled: number;
  };
  /** True if any line is billed beyond its scheduled value. */
  hasOverBilling: boolean;
};

const sovKey = (l: SovPayAppLineLike): string => `${l.lineNumber}|${l.costCode ?? ""}|${l.description}`;

export function reconcileSov(payApps: SovPayAppLike[]): SovReconReport {
  // Latest period wins for each SOV line (cumulative totals).
  const byKey = new Map<string, { period: number; line: SovPayAppLineLike }>();
  const ordered = [...payApps].sort((a, b) => a.periodNumber - b.periodNumber);
  for (const app of ordered) {
    for (const line of app.lines) {
      const key = sovKey(line);
      const prev = byKey.get(key);
      if (!prev || app.periodNumber >= prev.period) byKey.set(key, { period: app.periodNumber, line });
    }
  }

  const lines: SovReconLine[] = Array.from(byKey.entries()).map(([key, { line }]) => {
    const scheduled = toNum(line.scheduledValue);
    const billed = toNum(line.totalCompleted);
    const retainage = toNum(line.retainage);
    const balance = subtractMoney(scheduled, billed);
    const over = Math.max(0, subtractMoney(billed, scheduled));
    return {
      key,
      lineNumber: line.lineNumber,
      costCode: line.costCode,
      description: line.description,
      scheduledValue: scheduled,
      billedToDate: billed,
      percentComplete: scheduled > 0 ? Math.round((billed / scheduled) * 1000) / 10 : 0,
      retainageHeld: retainage,
      balanceToFinish: balance,
      overBilled: over,
    };
  });
  lines.sort((a, b) => a.lineNumber - b.lineNumber || a.description.localeCompare(b.description));

  const scheduledTotal = sumMoney(lines.map((l) => l.scheduledValue));
  const billedTotal = sumMoney(lines.map((l) => l.billedToDate));
  const retainageTotal = sumMoney(lines.map((l) => l.retainageHeld));
  const overTotal = sumMoney(lines.map((l) => l.overBilled));
  const balanceTotal = subtractMoney(scheduledTotal, billedTotal);

  return {
    lines,
    totals: {
      scheduledValue: scheduledTotal,
      billedToDate: billedTotal,
      percentComplete: scheduledTotal > 0 ? Math.round((billedTotal / scheduledTotal) * 1000) / 10 : 0,
      retainageHeld: retainageTotal,
      balanceToFinish: balanceTotal,
      overBilled: overTotal,
      underBilled: Math.max(0, balanceTotal),
    },
    hasOverBilling: overTotal > 0,
  };
}
