import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function SchedulePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { scheduleTasks: { orderBy: { startDate: "asc" } } },
  });
  if (!project) notFound();

  const tasks = project.scheduleTasks;
  if (tasks.length === 0) {
    return (
      <AppLayout eyebrow={`${project.code} · Schedule`} title={project.name}>
        <ProjectTabs projectId={project.id} active="schedule" mode={project.mode} />
        <div className="card mt-6 p-8 text-center text-slate-400">No schedule tasks yet — import one below.</div>
        <div className="mt-6">
          <ImportForm projectId={project.id} hasExisting={false} />
        </div>
      </AppLayout>
    );
  }

  const minDate = new Date(Math.min(...tasks.map((t) => new Date(t.startDate).getTime())));
  const maxDate = new Date(Math.max(...tasks.map((t) => new Date(t.endDate).getTime())));
  const spanDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
  const completeCount = tasks.filter((t) => t.percentComplete >= 100).length;
  const inProgressCount = tasks.filter((t) => t.percentComplete > 0 && t.percentComplete < 100).length;
  const criticalCount = tasks.filter((t) => t.onCriticalPath).length;
  const milestones = tasks.filter((t) => t.isMilestone);

  return (
    <AppLayout eyebrow={`${project.code} · Schedule`} title={project.name} description="Gantt-style project schedule with critical path, milestones, and baseline tracking.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="schedule" mode={project.mode} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/schedule/risk`} className="btn-primary text-xs">AI · Schedule risk scan</Link>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Total tasks" value={tasks.length} />
          <Stat label="In progress" value={inProgressCount} tone="warn" />
          <Stat label="Complete" value={completeCount} tone="good" />
          <Stat label="Critical path" value={criticalCount} tone="bad" />
        </section>

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Gantt — {formatDate(minDate)} → {formatDate(maxDate)}</div>
          <div className="mt-4 space-y-2">
            {tasks.map((task) => {
              const startOffsetPct = ((new Date(task.startDate).getTime() - minDate.getTime()) / (spanDays * 24 * 3600 * 1000)) * 100;
              const widthPct = Math.max(0.5, ((new Date(task.endDate).getTime() - new Date(task.startDate).getTime()) / (spanDays * 24 * 3600 * 1000)) * 100);
              const barColor = task.isMilestone ? "bg-amber-400" : task.onCriticalPath ? "bg-rose-500/80" : "bg-cyan-500/70";
              return (
                <div key={task.id} className="grid grid-cols-[220px_1fr_90px] items-center gap-3">
                  <div className="text-sm">
                    <div className="font-medium text-white">{task.wbs ? <span className="text-slate-500">{task.wbs} · </span> : null}{task.name}</div>
                    <div className="text-xs text-slate-500">{formatDate(task.startDate)} → {formatDate(task.endDate)} · {task.responsible ?? "—"}</div>
                  </div>
                  <div className="relative h-5 rounded-full bg-white/5">
                    <div
                      className={`absolute top-0 h-full rounded-full ${barColor}`}
                      style={{ left: `${startOffsetPct}%`, width: `${widthPct}%` }}
                      title={`${task.name} (${task.durationDays}d)`}
                    />
                    {task.percentComplete > 0 && !task.isMilestone ? (
                      <div
                        className="absolute top-0 h-full rounded-full bg-white/40"
                        style={{ left: `${startOffsetPct}%`, width: `${widthPct * (task.percentComplete / 100)}%` }}
                      />
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-slate-400">{task.isMilestone ? "milestone" : `${Math.round(task.percentComplete)}%`}</div>
                </div>
              );
            })}
          </div>
        </section>

        <ImportForm projectId={project.id} hasExisting />

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Milestones</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {milestones.map((m) => (
              <div key={m.id} className="panel p-4">
                <div className="text-sm font-medium text-white">{m.name}</div>
                <div className="mt-1 text-xs text-slate-500">{formatDate(m.startDate)}</div>
              </div>
            ))}
            {milestones.length === 0 ? <div className="text-sm text-slate-500">No milestones defined.</div> : null}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function ImportForm({ projectId, hasExisting }: { projectId: string; hasExisting: boolean }) {
  return (
    <section className="card p-5">
      <details open={!hasExisting}>
        <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.2em] text-cyan-300">Import schedule (CSV)</summary>
        <p className="mt-2 text-xs text-slate-400">
          CSV columns (header row, case-insensitive): <code className="text-cyan-300">name, start, finish</code> required;
          <code className="text-cyan-300"> wbs / activity_id, duration_days, percent_complete</code> optional. This is the
          CSV-shaped subset of a P6 / MS Project export.
          {hasExisting ? " Importing replaces the current schedule — the existing one is snapshotted as a baseline first." : ""}
        </p>
        <form action={`/api/projects/${projectId}/schedule/import`} method="post" encType="multipart/form-data" className="mt-3 flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".csv,text/csv" required className="form-input max-w-sm text-xs" aria-label="Schedule CSV file" />
          <button className="btn-primary text-xs">{hasExisting ? "Re-import schedule" : "Import schedule"}</button>
        </form>
      </details>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
