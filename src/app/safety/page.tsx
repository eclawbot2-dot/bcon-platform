import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, inspectionKindLabel } from "@/lib/utils";

export default async function SafetyDashboardPage() {
  const tenant = await requireTenant();
  const [incidents, inspections] = await Promise.all([
    prisma.safetyIncident.findMany({ where: { project: { tenantId: tenant.id } }, include: { project: true }, orderBy: { occurredAt: "desc" }, take: 100 }),
    prisma.inspection.findMany({ where: { project: { tenantId: tenant.id }, OR: [{ kind: "OSHA" }, { kind: "ENVIRONMENTAL" }] }, include: { project: true }, orderBy: { scheduledAt: "desc" }, take: 100 }),
  ]);
  const failed = inspections.filter((i) => i.result === "FAIL").length;
  const scheduled = inspections.filter((i) => !i.completedAt).length;

  return (
    <AppLayout eyebrow="Safety & compliance" title="Safety dashboard" description="Incidents, near-misses, OSHA and environmental inspections across every active project.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Incidents (last 100)" value={incidents.length} />
          <StatTile label="OSHA inspections" value={inspections.length} />
          <StatTile label="Failed" value={failed} tone={failed > 0 ? "bad" : "good"} />
          <StatTile label="Scheduled" value={scheduled} tone={scheduled > 0 ? "warn" : "good"} />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Incident log</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No incidents."
              columns={[
                { header: "Project" },
                { header: "Title" },
                { header: "Severity" },
                { header: "Occurred" },
                { header: "Status" },
              ]}
              rows={incidents.map((i) => ({
                key: i.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: i.project.code, node: <Link href={`/projects/${i.project.id}/safety`} className="text-cyan-300 hover:underline">{i.project.code}</Link> },
                  { sort: i.title, node: <Link href={`/projects/${i.project.id}/safety/${i.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{i.title}</Link> },
                  { sort: i.severity, node: i.severity },
                  { sort: i.occurredAt ? new Date(i.occurredAt).getTime() : undefined, node: formatDate(i.occurredAt), tdClassName: "text-slate-400" },
                  { sort: i.status, node: <StatusBadge status={i.status} /> },
                ],
              }))}
            />
          </div>
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">OSHA & environmental inspections</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No inspections."
              columns={[
                { header: "Project" },
                { header: "Kind" },
                { header: "Title" },
                { header: "Scheduled" },
                { header: "Result" },
              ]}
              rows={inspections.map((i) => ({
                key: i.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: i.project.code, node: <Link href={`/projects/${i.project.id}/inspections`} className="text-cyan-300 hover:underline">{i.project.code}</Link> },
                  { sort: inspectionKindLabel(i.kind), node: inspectionKindLabel(i.kind) },
                  { sort: i.title, node: <Link href={`/projects/${i.project.id}/inspections/${i.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{i.title}</Link> },
                  { sort: i.scheduledAt ? new Date(i.scheduledAt).getTime() : undefined, node: formatDate(i.scheduledAt), tdClassName: "text-slate-400" },
                  { sort: i.result ?? "", node: <StatusBadge status={i.result} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
