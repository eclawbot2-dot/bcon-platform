import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function RfisPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { rfis: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) notFound();

  const open = project.rfis.filter((r) => r.status !== "CLOSED" && r.status !== "APPROVED").length;
  const overdue = project.rfis.filter((r) => r.dueDate && new Date(r.dueDate) < new Date() && r.status !== "CLOSED" && r.status !== "APPROVED").length;

  return (
    <AppLayout eyebrow={`${project.code} · RFIs`} title={project.name} description="Requests for information — ball-in-court, aging, cost & schedule impact.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="rfis" mode={project.mode} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/rfis/draft`} className="btn-primary text-xs">AI · Draft RFI from observation</Link>
        </div>
        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Total RFIs" value={project.rfis.length} />
          <Stat label="Open" value={open} tone="warn" />
          <Stat label="Overdue" value={overdue} tone="bad" />
          <Stat label="Avg days open" value={computeAvgDaysOpen(project.rfis)} />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">RFI log</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No RFIs tracked."
              columns={[
                { header: "#" },
                { header: "Subject" },
                { header: "Ball in court" },
                { header: "Due" },
                { header: "Status" },
              ]}
              rows={project.rfis.map((r) => ({
                key: r.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: r.number, node: r.number, tdClassName: "font-mono text-xs text-slate-400" },
                  { sort: r.subject, node: <Link href={`/projects/${project.id}/rfis/${r.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{r.subject}</Link> },
                  { sort: r.ballInCourt ?? "", node: r.ballInCourt ?? "—" },
                  { sort: r.dueDate ? new Date(r.dueDate).getTime() : null, node: formatDate(r.dueDate), tdClassName: "text-slate-400" },
                  { sort: r.status, node: <StatusBadge status={r.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function computeAvgDaysOpen(rfis: { createdAt: Date; status: string }[]): string {
  if (rfis.length === 0) return "—";
  const now = Date.now();
  const total = rfis.reduce((s, r) => s + Math.max(0, (now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24)), 0);
  return `${Math.round(total / rfis.length)}d`;
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
