import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function SafetyPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { safetyIncidents: { orderBy: { occurredAt: "desc" } } },
  });
  if (!project) notFound();

  const bySeverity = project.safetyIncidents.reduce<Record<string, number>>((acc, i) => { acc[i.severity] = (acc[i.severity] ?? 0) + 1; return acc; }, {});

  return (
    <AppLayout eyebrow={`${project.code} · Safety`} title={project.name} description="Incident reports, near-misses, OSHA tracking.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="safety" mode={project.mode} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/safety/draft`} className="btn-primary text-xs">AI · Draft OSHA 301 report</Link>
        </div>
        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Total incidents" value={project.safetyIncidents.length} />
          <Stat label="Minor" value={bySeverity.minor ?? bySeverity.MINOR ?? 0} />
          <Stat label="Near-miss" value={bySeverity["near-miss"] ?? bySeverity.NEAR_MISS ?? 0} tone="warn" />
          <Stat label="Recordable" value={bySeverity.recordable ?? bySeverity.RECORDABLE ?? 0} tone="bad" />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No incidents logged."
              columns={[
                { header: "Title" },
                { header: "Severity" },
                { header: "Occurred" },
                { header: "Status" },
              ]}
              rows={project.safetyIncidents.map((i) => ({
                key: i.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: i.title, node: <Link href={`/projects/${project.id}/safety/${i.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{i.title}</Link> },
                  { sort: i.severity, node: i.severity },
                  { sort: i.occurredAt ? new Date(i.occurredAt).getTime() : null, node: formatDate(i.occurredAt), tdClassName: "text-slate-400" },
                  { sort: i.status, node: <StatusBadge status={i.status} /> },
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
  return <div className="panel p-4"><div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div><div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div></div>;
}
