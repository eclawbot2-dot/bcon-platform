"use client";

import { useEffect, useState } from "react";

type Burndown = {
  project: { progressPct: number | null; contractValue: number };
  budget: { original: number; current: number; forecastFinal: number; varianceForecastVsCurrent: number };
  billing: { totalBilled: number; retainageHeld: number; balanceToFinish: number; percentBilled: number };
  asOf: string;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/**
 * Financial burndown widget for the project overview. Fetches the
 * combined budget/billing snapshot from /api/projects/[id]/burndown
 * so the overview page (already a heavy server render) doesn't have
 * to join budgets + pay-app lines too.
 */
export function ProjectBurndown({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Burndown | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/burndown`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: Burndown) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (error) return null; // non-essential widget — disappear quietly on failure
  if (!data) {
    return (
      <div className="card p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Financial burndown</div>
        <div className="mt-4 text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { budget, billing } = data;
  const pct = Math.max(0, Math.min(100, billing.percentBilled));
  const overForecast = budget.varianceForecastVsCurrent > 0;

  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Financial burndown</div>
      <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
        <div><span className="text-slate-500">Budget (current):</span> {fmt(budget.current)}</div>
        <div><span className="text-slate-500">Forecast at completion:</span>{" "}
          <span className={overForecast ? "text-amber-300" : ""}>{fmt(budget.forecastFinal)}</span>
        </div>
        <div><span className="text-slate-500">Billed to date:</span> {fmt(billing.totalBilled)}</div>
        <div><span className="text-slate-500">Retainage held:</span> {fmt(billing.retainageHeld)}</div>
        <div><span className="text-slate-500">Balance to finish:</span> {fmt(billing.balanceToFinish)}</div>
        <div>
          <span className="text-slate-500">Forecast variance:</span>{" "}
          <span className={overForecast ? "text-amber-300" : "text-emerald-300"}>
            {budget.varianceForecastVsCurrent >= 0 ? "+" : "−"}{fmt(Math.abs(budget.varianceForecastVsCurrent))}
          </span>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>% billed vs current budget</span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-white/5">
          <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
