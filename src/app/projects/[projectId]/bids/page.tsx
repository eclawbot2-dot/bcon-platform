import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, subtractMoney, toNum } from "@/lib/money";

export default async function BidsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      bidPackages: {
        include: { subBids: { include: { vendor: true }, orderBy: { bidAmount: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) notFound();

  const totalPackages = project.bidPackages.length;
  const totalInvited = project.bidPackages.reduce((s, p) => s + p.subBids.length, 0);
  const selected = project.bidPackages.reduce((s, p) => s + p.subBids.filter((b) => b.status === "SELECTED").length, 0);
  const committedValue = sumMoney(project.bidPackages.flatMap((p) => p.subBids.filter((b) => b.status === "SELECTED").map((b) => b.bidAmount ?? 0)));

  return (
    <AppLayout eyebrow={`${project.code} · Bid packages`} title={project.name} description="Trade bid packages with sub invites, bid leveling, and selection.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="bids" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Bid packages" value={totalPackages} />
          <StatTile label="Subs invited" value={totalInvited} />
          <StatTile label="Selected" value={selected} tone="good" />
          <StatTile label="Committed value" value={formatCurrency(committedValue)} tone="good" />
        </section>
        {project.bidPackages.map((pkg) => {
          const low = Math.min(...pkg.subBids.filter((b) => b.bidAmount).map((b) => toNum(b.bidAmount!)));
          return (
            <section key={pkg.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{pkg.trade}</div>
                  <Link href={`/projects/${project.id}/bids/${pkg.id}`} className="mt-1 block text-lg font-semibold text-white hover:text-cyan-200 hover:underline">{pkg.name}</Link>
                  <div className="text-xs text-slate-500">Due: {formatDate(pkg.dueDate)} · Est. value: {formatCurrency(pkg.estimatedValue)}</div>
                  {pkg.scopeSummary ? <div className="mt-2 text-sm text-slate-300">{pkg.scopeSummary}</div> : null}
                </div>
                <StatusBadge status={pkg.status} />
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <SortableTable
                  emptyMessage="No bidders invited."
                  columns={[
                    { header: "Vendor" },
                    { header: "Amount" },
                    { header: "Δ vs. low" },
                    { header: "Duration" },
                    { header: "Status" },
                  ]}
                  rows={pkg.subBids.map((b) => {
                    const delta = b.bidAmount && isFinite(low) ? subtractMoney(b.bidAmount, low) : null;
                    return {
                      key: b.id,
                      className: "cursor-pointer transition hover:bg-white/5",
                      cells: [
                        {
                          sort: b.vendor.name,
                          node: (
                            <Link href={`/vendors/${b.vendor.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                              <div className="font-medium">{b.vendor.name}</div>
                              <div className="text-xs text-slate-500">{b.vendor.trade ?? "—"}</div>
                            </Link>
                          ),
                        },
                        { sort: b.bidAmount ? toNum(b.bidAmount) : null, node: b.bidAmount ? formatCurrency(b.bidAmount) : "—" },
                        {
                          sort: delta,
                          node: delta == null ? "—" : delta === 0 ? <span className="text-emerald-300">Low bid</span> : `+${formatCurrency(delta)}`,
                        },
                        { sort: b.daysToComplete ?? null, node: b.daysToComplete ? `${b.daysToComplete}d` : "—", tdClassName: "text-slate-400" },
                        { sort: b.status, node: <StatusBadge status={b.status} /> },
                      ],
                    };
                  })}
                />
              </div>
            </section>
          );
        })}
        {project.bidPackages.length === 0 ? <div className="card p-8 text-center text-slate-500">No bid packages yet.</div> : null}
      </div>
    </AppLayout>
  );
}
