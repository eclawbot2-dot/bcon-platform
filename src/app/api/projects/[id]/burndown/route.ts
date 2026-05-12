/**
 * GET /api/projects/[id]/burndown
 *
 * Project financial burndown snapshot. Combines budget, billings,
 * and progress into one response so the project dashboard widget
 * doesn't have to compute it client-side from 3 separate fetches.
 *
 * Returns:
 *   - contractValue            (from Project.contractValue)
 *   - originalBudget           (sum of Budget.originalValue)
 *   - currentBudget            (sum of Budget.currentValue — incl. change orders)
 *   - forecastFinal            (sum of Budget.forecastFinal, fallback to current)
 *   - totalBilled              (sum of PayApplicationLine.totalCompleted)
 *   - retainageHeld            (sum of PayApplicationLine.retainage)
 *   - balanceToFinish          (sum of PayApplicationLine.balanceToFinish)
 *   - percentBilled            (totalBilled / currentBudget)
 *   - progressPct              (from Project.progressPct, manually reported)
 *   - varianceForecastVsCurrent
 *
 * Tenant-scoped via auth().userId membership; 404 on cross-tenant
 * to avoid leaking that the project exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum, sumMoney } from "@/lib/money";
import { noStore } from "@/lib/http-cache";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      name: true,
      code: true,
      stage: true,
      contractValue: true,
      marginTargetPct: true,
      progressPct: true,
    },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Membership check: user must belong to the project's tenant.
  const membership = await prisma.membership.findFirst({
    where: { userId: session.userId, entity: { tenantId: project.tenantId } },
    select: { id: true },
  });
  if (!membership && !session.superAdmin) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [budgets, payAppLines] = await Promise.all([
    prisma.budget.findMany({
      where: { projectId: id },
      select: { originalValue: true, currentValue: true, forecastFinal: true },
    }),
    prisma.payApplicationLine.findMany({
      where: { payApplication: { projectId: id } },
      select: {
        scheduledValue: true,
        totalCompleted: true,
        retainage: true,
        balanceToFinish: true,
      },
    }),
  ]);

  const originalBudget = sumMoney(budgets.map((b) => b.originalValue));
  const currentBudget = sumMoney(budgets.map((b) => b.currentValue));
  const forecastFinal = sumMoney(budgets.map((b) => b.forecastFinal ?? b.currentValue));
  const totalBilled = sumMoney(payAppLines.map((l) => l.totalCompleted));
  const retainageHeld = sumMoney(payAppLines.map((l) => l.retainage));
  const balanceToFinish = sumMoney(payAppLines.map((l) => l.balanceToFinish));
  const percentBilled = currentBudget > 0 ? Math.round((totalBilled / currentBudget) * 1000) / 10 : 0;

  return noStore({
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
      stage: project.stage,
      contractValue: toNum(project.contractValue),
      marginTargetPct: project.marginTargetPct,
      progressPct: project.progressPct,
    },
    budget: {
      original: originalBudget,
      current: currentBudget,
      forecastFinal,
      varianceForecastVsCurrent: forecastFinal - currentBudget,
    },
    billing: {
      totalBilled,
      retainageHeld,
      balanceToFinish,
      percentBilled,
    },
    asOf: new Date().toISOString(),
  });
}
