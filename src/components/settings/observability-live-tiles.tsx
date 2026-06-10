"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/ui/stat-tile";

export type ObservabilityHeadline = {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  slowCount: number;
  p50Ms: number;
  p95Ms: number;
  generatedAt: number;
};

/**
 * Headline observability tiles with optional live refresh. Server page
 * renders the initial snapshot; when auto-refresh is on, this polls
 * /api/admin/observability (super-admin JSON endpoint) every 30s so an
 * operator can leave the page open during an incident.
 */
export function ObservabilityLiveTiles({ initial, windowMinutes }: { initial: ObservabilityHeadline; windowMinutes: number }) {
  const [data, setData] = useState<ObservabilityHeadline>(initial);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/observability?windowMinutes=${windowMinutes}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as ObservabilityHeadline;
        if (!cancelled) {
          setData(json);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [live, windowMinutes]);

  const errorRate = (data.errorRate * 100).toFixed(2);
  const errorTone: "warn" | "default" | "good" = data.errorRate > 0.05 ? "warn" : data.errorRate > 0 ? "default" : "good";

  return (
    <div className="grid gap-3">
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label={`Requests (last ${windowMinutes}m)`} value={data.totalRequests} sub={data.totalRequests === 0 ? "no traffic captured" : undefined} />
        <StatTile label="Error rate" value={`${errorRate}%`} tone={errorTone} sub={`${data.errorCount} errors`} />
        <StatTile label="p50 / p95 latency" value={`${data.p50Ms} / ${data.p95Ms}ms`} tone={data.p95Ms > 1000 ? "warn" : "good"} />
        <StatTile label="Slow requests" value={data.slowCount} sub="≥1s response" tone={data.slowCount > 0 ? "warn" : "good"} />
      </section>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Auto-refresh headline tiles every 30s
        </label>
        {live && !failed ? <span className="text-emerald-300">live · updated {new Date(data.generatedAt).toLocaleTimeString()}</span> : null}
        {live && failed ? <span className="text-rose-300">refresh failed — retrying</span> : null}
      </div>
    </div>
  );
}
