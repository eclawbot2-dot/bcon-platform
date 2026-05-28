import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { SortableTable } from "@/components/SortableTable";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { scheduleRiskScan } from "@/lib/execution-ai";

export default async function ScheduleRiskPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) notFound();
  const flags = await scheduleRiskScan(projectId, tenant.id);
  const high = flags.filter((f) => f.risk === "HIGH").length;
  const med = flags.filter((f) => f.risk === "MED").length;

  return (
    <DetailShell
      eyebrow="AI · Schedule risk scan"
      title={`${project.code} — Slip projections`}
      subtitle={`Scanned schedule tasks for risk based on progress, dates, and critical path.`}
      crumbs={[{ label: "Projects", href: "/projects" }, { label: project.code, href: `/projects/${projectId}` }, { label: "Schedule", href: `/projects/${projectId}/schedule` }, { label: "Risk" }]}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="High risk" value={high} tone={high > 0 ? "bad" : "good"} />
        <StatTile label="Medium risk" value={med} tone={med > 0 ? "warn" : "good"} />
        <StatTile label="Tasks flagged" value={flags.length} />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No tasks at risk — schedule trending on baseline."
          columns={[
            { header: "Task" },
            { header: "Risk" },
            { header: "Predicted slip (days)" },
            { header: "Why" },
          ]}
          rows={flags.map((f, i) => ({
            key: String(i),
            cells: [
              { sort: f.taskTitle, node: f.taskTitle },
              { sort: f.risk, node: <StatusBadge status={f.risk} /> },
              { sort: f.daysSlipPredicted, node: f.daysSlipPredicted },
              { sort: f.reason, node: f.reason, tdClassName: "text-xs text-slate-400" },
            ],
          }))}
        />
      </section>
      <Link href={`/projects/${projectId}/schedule`} className="btn-outline text-xs">← back</Link>
    </DetailShell>
  );
}
