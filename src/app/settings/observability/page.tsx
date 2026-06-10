import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { auth } from "@/lib/auth";
import { snapshot } from "@/lib/metrics";
import { formatDateTime } from "@/lib/utils";
import { ObservabilityLiveTiles } from "@/components/settings/observability-live-tiles";

/**
 * Observability page — surfaces in-process metrics for super-admins.
 * Sized for the 3-4 customer footprint: in-memory ring buffers, no
 * external metrics stack. State resets on process restart, which is
 * fine because incident response uses the structured log stream and
 * the AuditEvent / WebhookDelivery DB tables for forensics.
 */
export default async function ObservabilityPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const session = await auth();
  if (!session?.superAdmin) {
    redirect("/settings");
  }
  const sp = await searchParams;
  const windowMinutes = Math.max(1, Math.min(1440, Number(sp.window ?? "60")));
  const data = snapshot(windowMinutes * 60 * 1000);

  return (
    <AppLayout
      eyebrow="Platform · super admin"
      title="Observability"
      description="In-process request and error metrics. State resets on deploy. For permanent forensics use the audit log + structured log stream."
    >
      <div className="grid gap-6">
        <ObservabilityLiveTiles
          windowMinutes={windowMinutes}
          initial={{
            totalRequests: data.totalRequests,
            errorCount: data.errorCount,
            errorRate: data.errorRate,
            slowCount: data.slowCount,
            p50Ms: data.p50Ms,
            p95Ms: data.p95Ms,
            generatedAt: data.generatedAt,
          }}
        />

        <section className="card p-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Window (minutes)</span>
              <select name="window" defaultValue={String(windowMinutes)} className="form-select">
                <option value="15">Last 15 minutes</option>
                <option value="60">Last hour</option>
                <option value="240">Last 4 hours</option>
                <option value="720">Last 12 hours</option>
                <option value="1440">Last 24 hours</option>
              </select>
            </label>
            <button type="submit" className="btn-primary">Refresh</button>
            <span className="text-xs text-slate-500">Snapshot at {formatDateTime(new Date(data.generatedAt))}</span>
          </form>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-cyan-300">Per-route latency</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage={<>No requests recorded yet — middleware captures auth-terminated requests; route handlers must call <code className="text-xs text-cyan-300">withMetrics()</code> for full coverage.</>}
              columns={[
                { header: "Route" },
                { header: "Count", align: "right" },
                { header: "Errors", align: "right" },
                { header: "Avg", align: "right" },
                { header: "p50", align: "right" },
                { header: "p95", align: "right" },
              ]}
              rows={data.perRoute.slice(0, 50).map((r) => ({
                key: r.route,
                className: r.errorCount > 0 ? "bg-rose-500/5" : "",
                cells: [
                  { sort: r.route, node: r.route, tdClassName: "font-mono text-xs" },
                  { sort: r.count, node: r.count, tdClassName: "tabular-nums" },
                  { sort: r.errorCount, node: r.errorCount > 0 ? <span className="text-rose-300">{r.errorCount}</span> : 0, tdClassName: "tabular-nums" },
                  { sort: r.avgMs, node: `${r.avgMs}ms`, tdClassName: "tabular-nums" },
                  { sort: r.p50Ms, node: `${r.p50Ms}ms`, tdClassName: "tabular-nums" },
                  { sort: r.p95Ms, node: `${r.p95Ms}ms`, tdClassName: `tabular-nums ${r.p95Ms > 1000 ? "text-amber-300" : ""}` },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-cyan-300">Recent errors</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No errors captured in this window — clean."
              columns={[
                { header: "When" },
                { header: "Module" },
                { header: "Path" },
                { header: "Message" },
              ]}
              rows={data.recentErrors.map((e, i) => ({
                key: `${e.t}-${i}`,
                cells: [
                  { sort: e.t, node: formatDateTime(new Date(e.t)), tdClassName: "text-xs text-slate-400" },
                  { sort: e.module, node: e.module, tdClassName: "font-mono text-xs" },
                  { sort: e.path ?? "", node: e.path ?? "—", tdClassName: "font-mono text-xs text-slate-400" },
                  { sort: e.message, node: e.message, tdClassName: "text-rose-200" },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-cyan-300">Cron runs</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No cron runs captured since restart."
              columns={[
                { header: "Job" },
                { header: "Last run" },
                { header: "Status" },
                { header: "Duration" },
                { header: "Note" },
              ]}
              rows={data.cronRuns.map((r) => ({
                key: r.name,
                cells: [
                  { sort: r.name, node: r.name, tdClassName: "font-mono text-xs" },
                  { sort: r.startedAt, node: formatDateTime(new Date(r.startedAt)), tdClassName: "text-xs text-slate-400" },
                  {
                    sort: r.ok ? 1 : 0,
                    node: r.ok ? (
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">ok</span>
                    ) : (
                      <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">failed</span>
                    ),
                  },
                  { sort: r.finishedAt - r.startedAt, node: `${r.finishedAt - r.startedAt}ms`, tdClassName: "text-right tabular-nums text-xs" },
                  { sort: r.message ?? "", node: r.message ?? "—", tdClassName: "text-xs text-slate-400" },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Notes</div>
          <ul className="mt-2 list-disc pl-5 text-xs text-slate-400 space-y-1">
            <li>State resets on process restart. For long-term forensics use the audit log and structured log stream.</li>
            <li>Sized for 3–4 customer scale. In-memory ring buffers: 500 requests, 100 errors. Per-route reservoir of 50 samples for percentiles.</li>
            <li>Set <code className="text-cyan-300">SENTRY_DSN</code> to also forward errors to Sentry. <code className="text-cyan-300">log.ts</code> auto-forwards on captureException.</li>
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}
