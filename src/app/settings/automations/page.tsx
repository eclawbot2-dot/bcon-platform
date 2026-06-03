import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor, isAdminRole } from "@/lib/permissions";
import { isLlmEnabled } from "@/lib/ai";
import { WORKFLOWS, effectiveIntervalMinutes } from "@/lib/automations/registry";
import { formatDateTime } from "@/lib/utils";

/**
 * Autonomous workflows — admin-only, per-tenant engine controls.
 *
 * Gating: requireTenant() resolves the caller's OWN tenant; currentActor()
 * resolves their role IN it. Non-admins (or callers with no membership) get
 * a 404 via notFound(). Every workflow is OFF + advisory by default; an
 * admin opts each in explicitly. The registry (code) is merged with the
 * per-tenant AutomationConfig rows so newly shipped workflows always appear.
 */
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  if (!isAdminRole(actor.role)) notFound();

  const sp = await searchParams;
  const llmOn = isLlmEnabled();

  const configs = await prisma.automationConfig.findMany({ where: { tenantId: tenant.id } });
  const configByKey = new Map(configs.map((c) => [c.workflowKey, c] as const));

  const recentRuns = await prisma.automationRun.findMany({
    where: { tenantId: tenant.id },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  const enabledCount = configs.filter((c) => c.enabled).length;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const errors24h = recentRuns.filter((r) => r.status === "ERROR" && new Date(r.startedAt) >= since).length;
  const lastRun = recentRuns[0] ?? null;

  return (
    <AppLayout
      eyebrow="Settings · Autonomous workflows"
      title="Autonomous workflows"
      description="Clock-driven intelligence. Each workflow is OFF and advisory by default — turn one on and the engine runs it on its cadence, producing alerts / review items (never silent mutations). Admin-only."
    >
      <div className="grid gap-6">
        {sp.ok ? <Banner tone="good">{decodeURIComponent(sp.ok.replace(/\+/g, " "))}</Banner> : null}
        {sp.error ? <Banner tone="bad">{decodeURIComponent(sp.error.replace(/\+/g, " "))}</Banner> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Workflows available" value={WORKFLOWS.length} sub={`${enabledCount} enabled`} />
          <StatTile label="Enabled" value={enabledCount} tone={enabledCount > 0 ? "good" : "default"} sub="opt-in, advisory" />
          <StatTile label="Errors (24h)" value={errors24h} tone={errors24h > 0 ? "bad" : "good"} sub="across all runs" />
          <StatTile
            label="LLM connectivity"
            value={llmOn ? "Connected" : "Off"}
            tone={llmOn ? "good" : "warn"}
            sub={llmOn ? "key resolves" : "LLM workflows will SKIP"}
          />
        </section>

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Workflows</div>
          <p className="mt-1 text-xs text-slate-400">
            A red NEEDS-LLM-KEY badge means the workflow cleanly skips until an OpenAI/Anthropic key is configured (Settings → AI keys).
            Run-now previews a single execution; it works even while disabled.
          </p>
          <div className="mt-4 grid gap-3">
            {WORKFLOWS.map((w) => {
              const cfg = configByKey.get(w.key);
              const enabled = cfg?.enabled ?? false;
              const interval = effectiveIntervalMinutes(w, cfg?.intervalMinutesOverride);
              const needsKeyBlocked = w.requiresLlmKey && !llmOn;
              return (
                <div key={w.key} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{w.label}</span>
                        <span className="font-mono text-[10px] text-slate-500">{w.key}</span>
                        {w.requiresLlmKey ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${needsKeyBlocked ? "border border-rose-500/40 bg-rose-500/10 text-rose-200" : "border border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
                            Needs LLM key
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-200">No-input</span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${enabled ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
                          {enabled ? "Enabled" : "Off"}
                        </span>
                      </div>
                      <p className="mt-1 max-w-3xl text-xs text-slate-400">{w.description}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                        <span>Cadence: every {formatInterval(interval)}{cfg?.intervalMinutesOverride ? " (override)" : ""}</span>
                        <span>Last run: {cfg?.lastRunAt ? formatDateTime(cfg.lastRunAt) : "never"}</span>
                        {cfg?.lastStatus ? <span className={statusColor(cfg.lastStatus)}>Status: {cfg.lastStatus}</span> : null}
                        {cfg?.nextDueAt && enabled ? <span>Next due: {formatDateTime(cfg.nextDueAt)}</span> : null}
                      </div>
                      {cfg?.lastSummary ? <div className="mt-1 text-[11px] text-slate-400">{cfg.lastSummary}</div> : null}
                      {cfg?.lastError ? <div className="mt-1 text-[11px] text-rose-300">{cfg.lastError}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action="/api/tenant/automations/toggle" method="post">
                        <input type="hidden" name="workflowKey" value={w.key} />
                        <button className={enabled ? "btn-outline text-xs text-rose-300" : "btn-primary text-xs"}>
                          {enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      <form action="/api/tenant/automations/run-now" method="post">
                        <input type="hidden" name="workflowKey" value={w.key} />
                        <button className="btn-outline text-xs">Run now</button>
                      </form>
                      {w.trustGatable ? (
                        <form action="/api/tenant/automations/trust" method="post">
                          <input type="hidden" name="workflowKey" value={w.key} />
                          <button className={cfg?.trustGated ? "btn-outline text-xs text-amber-300" : "btn-outline text-xs"}>
                            {cfg?.trustGated ? "Trusted (act)" : "Advisory"}
                          </button>
                        </form>
                      ) : (
                        <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500" title="This workflow can only ever produce advisory output.">Advisory-only</span>
                      )}
                    </div>
                  </div>
                  <form action="/api/tenant/automations/interval" method="post" className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                    <input type="hidden" name="workflowKey" value={w.key} />
                    <label className="text-[11px] text-slate-400">Override cadence (minutes):</label>
                    <input
                      name="intervalMinutes"
                      type="number"
                      min={1}
                      defaultValue={cfg?.intervalMinutesOverride ?? ""}
                      placeholder={`default ${w.defaultIntervalMinutes}`}
                      className="form-input w-32 text-xs"
                    />
                    <button className="btn-outline text-xs">Save</button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Recent run history (last 50)</div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <SortableTable
              emptyMessage="No runs yet — enable a workflow or use Run now."
              columns={[
                { header: "Workflow" },
                { header: "Status" },
                { header: "Started" },
                { header: "Duration" },
                { header: "Produced" },
                { header: "Trigger" },
                { header: "Summary" },
              ]}
              rows={recentRuns.map((r) => ({
                key: r.id,
                cells: [
                  { sort: r.workflowKey, node: <span className="font-mono text-xs">{r.workflowKey}</span> },
                  { sort: r.status, node: <span className={statusColor(r.status)}>{r.status}</span> },
                  { sort: new Date(r.startedAt).getTime(), node: formatDateTime(r.startedAt), tdClassName: "text-slate-400 whitespace-nowrap" },
                  { sort: r.durationMs ?? 0, node: r.durationMs != null ? `${r.durationMs} ms` : "—", tdClassName: "text-slate-400" },
                  { sort: r.producedCount, node: r.producedCount, tdClassName: "text-slate-400" },
                  { sort: r.triggeredBy, node: <span className="text-[11px] text-slate-400">{r.triggeredBy}</span> },
                  { sort: r.summary ?? "", node: <span className="text-[11px] text-slate-400">{r.error ? <span className="text-rose-300">{r.error}</span> : r.summary}</span> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function formatInterval(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const d = minutes / (24 * 60);
    return d === 1 ? "day" : `${d} days`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "hour" : `${h} hours`;
  }
  return `${minutes} min`;
}

function statusColor(status: string): string {
  if (status === "SUCCESS") return "text-emerald-300";
  if (status === "ERROR") return "text-rose-300";
  if (status === "RUNNING") return "text-cyan-300";
  return "text-amber-300";
}

function Banner({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  const cls = tone === "good" ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" : "border-rose-500/40 bg-rose-500/5 text-rose-200";
  return <div className={`card p-3 text-sm ${cls}`}>{children}</div>;
}
