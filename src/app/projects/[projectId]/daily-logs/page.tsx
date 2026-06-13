import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { DictateTextarea } from "@/components/ui/dictate-textarea";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { NotebookPen } from "lucide-react";

const LOG_TYPES = ["GENERAL", "AREA", "CREW"];

export default async function DailyLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { projectId } = await params;
  const { ok, error } = await searchParams;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { dailyLogs: { orderBy: { logDate: "desc" } } },
  });
  if (!project) notFound();

  const canEdit = (await currentActor(tenant.id)).canEdit;
  const today = new Date().toISOString().slice(0, 10);
  const manpower = project.dailyLogs.reduce((s, l) => s + l.manpower, 0);

  return (
    <AppLayout eyebrow={`${project.code} · Daily logs`} title={project.name} description="Field superintendent daily reports — manpower, weather, delays, work performed.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="daily-logs" mode={project.mode} />
        {ok ? <div role="status" className="card border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{ok}</div> : null}
        {error ? <div role="alert" className="card border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">{error}</div> : null}
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/daily-logs/weekly-report`} className="btn-primary text-xs">AI · Generate weekly owner report</Link>
        </div>
        {canEdit ? (
          <section className="card p-5 min-w-0 overflow-hidden">
            <details>
              <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.2em] text-cyan-300">+ Log today&apos;s report</summary>
              <form action={`/api/projects/${project.id}/daily-logs/create`} method="post" className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="form-label">Date</span>
                  <input name="logDate" type="date" defaultValue={today} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Type</span>
                  <select name="logType" className="form-input" defaultValue="GENERAL">
                    {LOG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="form-label">Manpower (head count)</span>
                  <input name="manpower" type="number" inputMode="numeric" min={0} placeholder="0" className="form-input" />
                </label>
                <label className="block md:col-span-3">
                  <span className="form-label">Work performed (summary)</span>
                  <DictateTextarea name="summary" required rows={2} placeholder="e.g. Poured slab on grade, grids C–F; stripped forms at stair 2" className="form-textarea" />
                </label>
                <label className="block">
                  <span className="form-label">Weather</span>
                  <input name="weather" placeholder="e.g. 72°F, clear" className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Segment / area</span>
                  <input name="segment" placeholder="e.g. Bldg A, L2" className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Station</span>
                  <input name="station" placeholder="e.g. STA 12+50" className="form-input" />
                </label>
                <label className="block md:col-span-3">
                  <span className="form-label">Notes / delays (optional)</span>
                  <DictateTextarea name="notes" rows={2} placeholder="Delays, RFIs raised, deliveries, safety observations" className="form-textarea" />
                </label>
                <div className="md:col-span-3"><button className="btn-primary text-xs">Save daily log</button></div>
              </form>
            </details>
          </section>
        ) : null}
        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Total reports" value={project.dailyLogs.length} />
          <Stat label="Logged manpower" value={manpower.toLocaleString()} />
          <Stat label="Most recent" value={project.dailyLogs[0] ? formatDate(project.dailyLogs[0].logDate) : "—"} />
        </section>
        <section className="grid gap-3">
          {project.dailyLogs.map((log) => (
            <div key={log.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{formatDate(log.logDate)}</div>
                  <div className="text-xs text-slate-400">Type: {log.logType} · Weather: {log.weather ?? "—"} · Manpower: {log.manpower}</div>
                </div>
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-300">{log.summary}</div>
              {log.notes ? <div className="mt-2 text-xs text-slate-500">{log.notes}</div> : null}
            </div>
          ))}
          {project.dailyLogs.length === 0 ? (
            <div className="card p-6">
              <EmptyState icon={NotebookPen} title="No daily logs yet" description={canEdit ? "Use “Log today’s report” above to record manpower, weather, and work performed." : "Field daily reports — manpower, weather, and work performed — will appear here once the superintendent starts logging."} />
            </div>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="panel p-4 min-w-0 overflow-hidden"><div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div><div className="mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums text-white" title={String(value)}>{value}</div></div>;
}
