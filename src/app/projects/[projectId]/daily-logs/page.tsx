import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { NotebookPen } from "lucide-react";

export default async function DailyLogsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { dailyLogs: { orderBy: { logDate: "desc" } } },
  });
  if (!project) notFound();

  const manpower = project.dailyLogs.reduce((s, l) => s + l.manpower, 0);

  return (
    <AppLayout eyebrow={`${project.code} · Daily logs`} title={project.name} description="Field superintendent daily reports — manpower, weather, delays, work performed.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="daily-logs" mode={project.mode} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/daily-logs/weekly-report`} className="btn-primary text-xs">AI · Generate weekly owner report</Link>
        </div>
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
              <EmptyState icon={NotebookPen} title="No daily logs yet" description="Field daily reports — manpower, weather, and work performed — will appear here once the superintendent starts logging." />
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
