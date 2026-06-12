import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, inspectionKindLabel } from "@/lib/utils";

export default async function InspectionsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { inspections: { orderBy: { scheduledAt: "asc" } } },
  });
  if (!project) notFound();

  const scheduled = project.inspections.filter((i) => !i.completedAt).length;
  const passed = project.inspections.filter((i) => i.result === "PASS").length;
  const failed = project.inspections.filter((i) => i.result === "FAIL").length;
  const followUps = project.inspections.filter((i) => i.followUpNeeded).length;

  return (
    <AppLayout eyebrow={`${project.code} · Inspections`} title={project.name} description="Municipal, third-party, internal QC, pre-pour, pre-cover, OSHA — with pass/fail tracking.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="inspections" mode={project.mode} />

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Scheduled" value={scheduled} tone="warn" />
          <Stat label="Passed" value={passed} tone="good" />
          <Stat label="Failed" value={failed} tone="bad" />
          <Stat label="Follow-up needed" value={followUps} tone="warn" />
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Inspection log</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No inspections scheduled."
              columns={[
                { header: "Kind" },
                { header: "Title" },
                { header: "Location" },
                { header: "Inspector" },
                { header: "Scheduled" },
                { header: "Completed" },
                { header: "Result" },
                { header: "Follow-up" },
              ]}
              rows={project.inspections.map((i) => ({
                key: i.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: inspectionKindLabel(i.kind), node: inspectionKindLabel(i.kind) },
                  {
                    sort: i.title,
                    node: (
                      <Link href={`/projects/${project.id}/inspections/${i.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                        <div className="font-medium">{i.title}</div>
                        {i.followUpNotes ? <div className="text-xs text-slate-500">{i.followUpNotes}</div> : null}
                      </Link>
                    ),
                  },
                  { sort: i.location ?? "", node: i.location ?? "—", tdClassName: "text-slate-400" },
                  { sort: i.inspector ?? "", node: i.inspector ?? "—", tdClassName: "text-slate-400" },
                  { sort: i.scheduledAt ? new Date(i.scheduledAt).getTime() : null, node: formatDate(i.scheduledAt), tdClassName: "text-slate-400" },
                  { sort: i.completedAt ? new Date(i.completedAt).getTime() : null, node: formatDate(i.completedAt), tdClassName: "text-slate-400" },
                  { sort: i.result ?? "", node: <StatusBadge status={i.result} /> },
                  { sort: i.followUpNeeded ? 1 : 0, node: i.followUpNeeded ? <StatusBadge tone="warn" label="Yes" /> : <span className="text-slate-500">—</span> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="panel p-4 min-w-0 overflow-hidden">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums ${toneClass}`} title={String(value)}>{value}</div>
    </div>
  );
}
