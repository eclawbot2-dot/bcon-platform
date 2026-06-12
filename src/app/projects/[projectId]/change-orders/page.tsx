import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { changeOrderKindLabel, formatCurrency, formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { approvedCoValue, pendingCoValue } from "@/lib/change-order-totals";

export default async function ChangeOrdersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { changeOrders: { orderBy: { coNumber: "asc" }, include: { lines: true } } },
  });
  if (!project) notFound();

  const approvedTotal = approvedCoValue(project.changeOrders);
  const pendingTotal = pendingCoValue(project.changeOrders);
  const scheduleImpact = project.changeOrders.reduce((s, c) => s + c.scheduleImpactDays, 0);

  return (
    <AppLayout eyebrow={`${project.code} · Change orders`} title={project.name} description="Formal change management with approval workflows and cost + schedule impact.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="change-orders" mode={project.mode} />

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Total change orders" value={project.changeOrders.length} />
          <Stat label="Approved value" value={formatCurrency(approvedTotal)} tone="good" />
          <Stat label="Pending value" value={formatCurrency(pendingTotal)} tone="warn" />
          <Stat label="Schedule impact" value={`${scheduleImpact}d`} />
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-white">Change order log</div>
              <div className="text-xs text-slate-400">Click any change order to see its breakdown.</div>
            </div>
            <Link href={`/projects/${project.id}`} className="btn-outline text-xs">← Back to project</Link>
          </div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No change orders yet."
              columns={[
                { header: "#" },
                { header: "Kind" },
                { header: "Title" },
                { header: "Amount" },
                { header: "Sched. impact" },
                { header: "Status" },
                { header: "Requested" },
              ]}
              rows={project.changeOrders.map((co) => ({
                key: co.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: co.coNumber, node: co.coNumber, tdClassName: "font-mono text-xs text-slate-400" },
                  { sort: changeOrderKindLabel(co.kind), node: changeOrderKindLabel(co.kind) },
                  {
                    sort: co.title,
                    node: (
                      <Link href={`/projects/${project.id}/change-orders/${co.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                        <div className="font-medium">{co.title}</div>
                        {co.description ? <div className="text-xs text-slate-500">{co.description}</div> : null}
                      </Link>
                    ),
                  },
                  { sort: toNum(co.amount), node: formatCurrency(co.amount), tdClassName: "font-medium text-white" },
                  { sort: co.scheduleImpactDays, node: co.scheduleImpactDays ? `${co.scheduleImpactDays}d` : "—" },
                  { sort: co.status, node: <StatusBadge status={co.status} /> },
                  { sort: co.requestedAt ? new Date(co.requestedAt).getTime() : null, node: formatDate(co.requestedAt), tdClassName: "text-slate-400" },
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
