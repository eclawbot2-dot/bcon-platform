import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function WarrantyPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { warrantyItems: { orderBy: { reportedAt: "desc" } } },
  });
  if (!project) notFound();

  const open = project.warrantyItems.filter((w) => w.status === "OPEN" || w.status === "IN_PROGRESS").length;
  const resolved = project.warrantyItems.filter((w) => w.status === "RESOLVED").length;
  const avgResolveDays = (() => {
    const resolved = project.warrantyItems.filter((w) => w.resolvedAt);
    if (resolved.length === 0) return "—";
    const total = resolved.reduce((s, w) => s + (new Date(w.resolvedAt!).getTime() - new Date(w.reportedAt).getTime()) / (1000 * 60 * 60 * 24), 0);
    return `${Math.round(total / resolved.length)}d`;
  })();

  return (
    <AppLayout eyebrow={`${project.code} · Warranty`} title={project.name} description="Post-occupancy issues, who reported, who owns, and resolution tracking.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="warranty" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Items on file" value={project.warrantyItems.length} />
          <StatTile label="Open" value={open} tone="warn" />
          <StatTile label="Resolved" value={resolved} tone="good" />
          <StatTile label="Avg resolution" value={avgResolveDays} />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No warranty items."
              columns={[
                { header: "Title" },
                { header: "Reported by" },
                { header: "Assigned to" },
                { header: "Severity" },
                { header: "Reported" },
                { header: "Resolved" },
                { header: "Expires" },
                { header: "Status" },
              ]}
              rows={project.warrantyItems.map((w) => ({
                key: w.id,
                cells: [
                  {
                    sort: w.title,
                    node: (
                      <>
                        <div className="font-medium text-white">{w.title}</div>
                        {w.description ? <div className="text-xs text-slate-500">{w.description}</div> : null}
                      </>
                    ),
                  },
                  { sort: w.reportedBy ?? "", node: w.reportedBy ?? "—", tdClassName: "text-slate-400" },
                  { sort: w.assignedTo ?? "", node: w.assignedTo ?? "—", tdClassName: "text-slate-400" },
                  { sort: w.severity, node: w.severity },
                  { sort: w.reportedAt ? new Date(w.reportedAt).getTime() : undefined, node: formatDate(w.reportedAt), tdClassName: "text-slate-400" },
                  { sort: w.resolvedAt ? new Date(w.resolvedAt).getTime() : undefined, node: formatDate(w.resolvedAt), tdClassName: "text-slate-400" },
                  { sort: w.warrantyExpires ? new Date(w.warrantyExpires).getTime() : undefined, node: formatDate(w.warrantyExpires), tdClassName: "text-slate-400" },
                  { sort: w.status, node: <StatusBadge status={w.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
