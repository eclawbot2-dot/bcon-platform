import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function TasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { tasks: { include: { assignee: true }, orderBy: { dueDate: "asc" } } },
  });
  if (!project) notFound();

  const byStatus = {
    TODO: project.tasks.filter((t) => t.status === "TODO"),
    IN_PROGRESS: project.tasks.filter((t) => t.status === "IN_PROGRESS"),
    BLOCKED: project.tasks.filter((t) => t.status === "BLOCKED"),
    COMPLETE: project.tasks.filter((t) => t.status === "COMPLETE"),
  };

  return (
    <AppLayout eyebrow={`${project.code} · Tasks`} title={project.name} description="Field and office tasks across trades, with priority, due dates and assignees.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="tasks" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-4">
          {(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETE"] as const).map((s) => (
            <div key={s} className="panel p-4 min-w-0 overflow-hidden">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{s.replaceAll("_", " ")}</div>
              <div className="mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums text-white">{byStatus[s].length}</div>
            </div>
          ))}
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          {(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETE"] as const).map((s) => (
            <div key={s} className="card p-5 min-w-0 overflow-hidden">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{s.replaceAll("_", " ")}</div>
              <div className="mt-3 space-y-2">
                {byStatus[s].map((t) => (
                  <div key={t.id} className="rounded-2xl border border-white/5 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-white">{t.title}</div>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">Priority: {t.priority} · Due: {formatDate(t.dueDate)} · {t.assignee?.name ?? "Unassigned"}</div>
                    {t.description ? <div className="mt-1 text-xs text-slate-500">{t.description}</div> : null}
                  </div>
                ))}
                {byStatus[s].length === 0 ? <div className="text-sm text-slate-500">Nothing here.</div> : null}
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppLayout>
  );
}
