import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate, modeLabel } from "@/lib/utils";
import { sumMoney, multiplyMoney, toNum } from "@/lib/money";

export default async function BidsHubPage() {
  const tenant = await requireTenant();
  const [opportunities, bidPackages] = await Promise.all([
    prisma.opportunity.findMany({ where: { tenantId: tenant.id }, orderBy: [{ stage: "asc" }, { dueDate: "asc" }] }),
    prisma.bidPackage.findMany({ where: { project: { tenantId: tenant.id } }, include: { project: true, subBids: true }, orderBy: { dueDate: "asc" } }),
  ]);

  const pipelineValue = sumMoney(opportunities.filter((o) => o.stage !== "LOST" && o.stage !== "WITHDRAWN").map((o) => o.estimatedValue));
  const weightedValue = sumMoney(opportunities.filter((o) => o.stage !== "LOST" && o.stage !== "WITHDRAWN").map((o) => multiplyMoney(o.estimatedValue, o.probability / 100)));
  const openPackages = bidPackages.filter((p) => p.status !== "AWARDED" && p.status !== "CANCELLED").length;

  return (
    <AppLayout eyebrow="Business development" title="Bid hub" description="Opportunity pipeline, active bid packages, and trade invitations across every pursuit.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Opportunities" value={opportunities.length} />
          <StatTile label="Pipeline value" value={formatCurrency(pipelineValue)} />
          <StatTile label="Weighted pipeline" value={formatCurrency(weightedValue)} tone="good" />
          <StatTile label="Bid packages open" value={openPackages} tone={openPackages > 0 ? "warn" : "good"} />
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Opportunity pipeline</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No opportunities yet."
              columns={[
                { header: "Name" },
                { header: "Client" },
                { header: "Mode" },
                { header: "Stage" },
                { header: "Value" },
                { header: "Prob." },
                { header: "Weighted" },
                { header: "Due" },
                { header: "Owner" },
              ]}
              rows={opportunities.map((o) => ({
                key: o.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: o.name, tdClassName: "font-medium", node: <Link href={`/opportunities/${o.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{o.name}</Link> },
                  { sort: o.clientName ?? "", tdClassName: "text-slate-400", node: o.clientName ?? "—" },
                  { sort: modeLabel(o.mode), node: modeLabel(o.mode) },
                  { sort: o.stage, node: <StatusBadge status={o.stage} /> },
                  { sort: toNum(o.estimatedValue), node: formatCurrency(o.estimatedValue) },
                  { sort: o.probability, node: `${o.probability}%` },
                  { sort: toNum(multiplyMoney(o.estimatedValue, o.probability / 100)), node: formatCurrency(multiplyMoney(o.estimatedValue, o.probability / 100)) },
                  { sort: o.dueDate ? new Date(o.dueDate).getTime() : null, tdClassName: "text-slate-400", node: formatDate(o.dueDate) },
                  { sort: o.ownerName ?? "", tdClassName: "text-slate-400", node: o.ownerName ?? "—" },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Active bid packages</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No bid packages."
              columns={[
                { header: "Project" },
                { header: "Package" },
                { header: "Trade" },
                { header: "Est. value" },
                { header: "Invitees" },
                { header: "Due" },
                { header: "Status" },
              ]}
              rows={bidPackages.map((p) => ({
                key: p.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: p.project.code, node: <Link href={`/projects/${p.project.id}/bids`} className="text-cyan-300 hover:underline">{p.project.code}</Link> },
                  { sort: p.name, tdClassName: "font-medium text-white", node: p.name },
                  { sort: p.trade, node: p.trade },
                  { sort: toNum(p.estimatedValue), node: formatCurrency(p.estimatedValue) },
                  { sort: p.subBids.length, node: p.subBids.length },
                  { sort: p.dueDate ? new Date(p.dueDate).getTime() : null, tdClassName: "text-slate-400", node: formatDate(p.dueDate) },
                  { sort: p.status, node: <StatusBadge status={p.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
