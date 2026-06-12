import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { eacForecastLogged } from "@/lib/ai-cached";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency } from "@/lib/utils";

export default async function EacPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const projects = await prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true } });
  const logged = sp.projectId ? await eacForecastLogged(tenant.id, sp.projectId) : null;
  const forecast = logged?.result ?? null;
  const runId = logged?.runId ?? null;

  return (
    <AppLayout eyebrow="Finance AI" title="EAC forecaster" description="AI projects Estimate-at-Completion cost, revenue, and margin based on commitments + burn rate.">
      <form method="get" className="card p-6 flex flex-wrap gap-3 items-center">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Project</label>
        <select name="projectId" defaultValue={sp.projectId ?? ""} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">— select —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
        <button className="btn-primary">Forecast</button>
        <Link href="/finance/ai" className="btn-outline text-xs">← back</Link>
      </form>
      {forecast ? (
        <>
          <section className="grid gap-4 md:grid-cols-4 mt-6">
            <StatTile label="EAC revenue" value={formatCurrency(forecast.eacRevenue)} />
            <StatTile label="EAC cost" value={formatCurrency(forecast.eacCost)} />
            <StatTile label="EAC margin" value={formatCurrency(forecast.eacMargin)} tone={forecast.eacMargin > 0 ? "good" : "bad"} />
            <StatTile label="Margin %" value={`${forecast.marginPct.toFixed(1)}%`} tone={forecast.marginPct > 10 ? "good" : forecast.marginPct > 0 ? "warn" : "bad"} />
          </section>
          <section className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Variance vs plan</div>
            <div className={"mt-2 min-w-0 truncate text-3xl font-semibold tabular-nums " + (forecast.variance > 0 ? "text-rose-200" : "text-emerald-200")} title={formatCurrency(forecast.variance)}>{formatCurrency(forecast.variance)}</div>
            <p className="mt-3 text-sm text-slate-200 leading-6">{forecast.narrative}</p>
            {runId ? (
              <div className="mt-4 flex gap-2 items-center">
                <span className="text-xs text-slate-500">Useful?</span>
                <form action="/api/ai/feedback" method="post"><input type="hidden" name="runId" value={runId} /><input type="hidden" name="feedback" value="ACCEPTED" /><button className="btn-outline text-xs">✓ Accepted</button></form>
                <form action="/api/ai/feedback" method="post"><input type="hidden" name="runId" value={runId} /><input type="hidden" name="feedback" value="REJECTED" /><button className="btn-outline text-xs">✗ Rejected</button></form>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </AppLayout>
  );
}
