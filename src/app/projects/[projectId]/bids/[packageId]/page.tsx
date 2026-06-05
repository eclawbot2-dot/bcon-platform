import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { SortableTable } from "@/components/SortableTable";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, subtractMoney, toNum } from "@/lib/money";

export default async function BidPackageDetailPage({ params }: { params: Promise<{ projectId: string; packageId: string }> }) {
  const { projectId, packageId } = await params;
  const tenant = await requireTenant();
  const pkg = await prisma.bidPackage.findFirst({
    where: { id: packageId, project: { id: projectId, tenantId: tenant.id } },
    include: {
      project: true,
      subBids: { include: { vendor: true }, orderBy: { bidAmount: "asc" } },
    },
  });
  if (!pkg) notFound();

  const bidsWithAmount = pkg.subBids.filter((b) => b.bidAmount != null);
  const low = bidsWithAmount[0]?.bidAmount == null ? null : toNum(bidsWithAmount[0].bidAmount);
  const avg = bidsWithAmount.length > 0 ? sumMoney(bidsWithAmount.map((b) => b.bidAmount)) / bidsWithAmount.length : null;
  const selected = pkg.subBids.find((b) => b.status === "SELECTED");

  return (
    <DetailShell
      eyebrow={`${pkg.project.code} · Bid package`}
      title={pkg.name}
      subtitle={`${pkg.trade} · ${pkg.subBids.length} bidders`}
      crumbs={[{ label: "Projects", href: "/projects" }, { label: pkg.project.code, href: `/projects/${pkg.project.id}` }, { label: "Bids", href: `/projects/${pkg.project.id}/bids` }, { label: pkg.name }]}
      actions={<StatusBadge status={pkg.status} />}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Est. value" value={formatCurrency(pkg.estimatedValue)} />
        <StatTile label="Low bid" value={low !== null ? formatCurrency(low) : "—"} tone="good" />
        <StatTile label="Average bid" value={avg !== null ? formatCurrency(avg) : "—"} />
        <StatTile label="Selected vs est." value={selected?.bidAmount != null ? formatCurrency(subtractMoney(selected.bidAmount, pkg.estimatedValue)) : "—"} tone={selected?.bidAmount != null && toNum(selected.bidAmount) <= toNum(pkg.estimatedValue) ? "good" : "warn"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Package detail</div>
        <DetailGrid>
          <DetailField label="Name">{pkg.name}</DetailField>
          <DetailField label="Trade">{pkg.trade}</DetailField>
          <DetailField label="Status">{pkg.status.replaceAll("_", " ")}</DetailField>
          <DetailField label="Due date">{formatDate(pkg.dueDate)}</DetailField>
          <DetailField label="Estimated value">{formatCurrency(pkg.estimatedValue)}</DetailField>
          <DetailField label="Scope summary">{pkg.scopeSummary ?? "—"}</DetailField>
        </DetailGrid>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/projects/${projectId}/bids/${pkg.id}/level-matrix`} className="btn-primary text-xs">Leveling matrix</Link>
          <Link href={`/projects/${projectId}/bids/${pkg.id}/outreach`} className="btn-outline text-xs">AI · Draft ITB email</Link>
          <Link href={`/projects/${projectId}/bids/${pkg.id}/leveling`} className="btn-outline text-xs">AI · Level sub bids</Link>
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Bid leveling</div>
        <div className="overflow-x-auto">
          <SortableTable
            emptyMessage="No bidders invited."
            columns={[
              { header: "Vendor" },
              { header: "Amount" },
              { header: "Δ vs. low" },
              { header: "Δ vs. estimate" },
              { header: "Days" },
              { header: "Status" },
              { header: "", sortable: false },
            ]}
            rows={pkg.subBids.map((b) => {
              const deltaLow = b.bidAmount !== null && low !== null ? subtractMoney(b.bidAmount, low) : null;
              const deltaEst = b.bidAmount !== null ? subtractMoney(b.bidAmount, pkg.estimatedValue) : null;
              const awardable = pkg.status !== "AWARDED" && b.status !== "SELECTED" && b.bidAmount != null;
              return {
                key: b.id,
                className: "transition hover:bg-white/5",
                cells: [
                  {
                    sort: b.vendor.name,
                    node: (
                      <>
                        <Link href={`/vendors/${b.vendor.id}`} className="font-medium text-white hover:text-cyan-200">{b.vendor.name}</Link>
                        <div className="text-xs text-slate-500">{b.vendor.trade ?? "—"}</div>
                      </>
                    ),
                  },
                  { sort: b.bidAmount != null ? toNum(b.bidAmount) : null, node: formatCurrency(b.bidAmount) },
                  {
                    sort: deltaLow,
                    node: deltaLow === null ? "—" : deltaLow === 0 ? <span className="text-emerald-300">Low bid</span> : `+${formatCurrency(deltaLow)}`,
                  },
                  {
                    sort: deltaEst,
                    node: deltaEst === null ? "—" : <span className={deltaEst <= 0 ? "text-emerald-300" : "text-rose-300"}>{deltaEst > 0 ? "+" : ""}{formatCurrency(deltaEst)}</span>,
                  },
                  { sort: b.daysToComplete ?? null, node: b.daysToComplete ? `${b.daysToComplete}d` : "—", tdClassName: "text-slate-400" },
                  { sort: b.status, node: <StatusBadge status={b.status} /> },
                  {
                    node: awardable ? (
                      <form action={`/api/bids/${pkg.id}/subbids/${b.id}/award`} method="post">
                        <button className="btn-primary text-xs">Award →</button>
                      </form>
                    ) : b.status === "SELECTED" ? <span className="text-xs text-emerald-300">awarded</span> : null,
                  },
                ],
              };
            })}
          />
        </div>
      </section>
    </DetailShell>
  );
}
