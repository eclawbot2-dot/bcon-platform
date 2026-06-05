import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { formatCurrency } from "@/lib/utils";
import { subtractMoney } from "@/lib/money";
import { buildLevelingMatrix, buildBidderSummaries, type LevelingBidder } from "@/lib/leveling";
import { Layers } from "lucide-react";

/**
 * Bid leveling matrix — one row per scope item, one column per bidder.
 * Cells show the bidder's amount + inclusion/exclusion flag. The lowest
 * non-excluded amount per row is highlighted, high outliers are flagged,
 * and the GC can record awards per scope item. A bidder-summary strip
 * normalizes each sub to an apples-to-apples leveled total.
 */
export default async function BidLevelingPage({ params }: { params: Promise<{ projectId: string; packageId: string }> }) {
  const { projectId, packageId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) notFound();

  const pkg = await prisma.bidPackage.findFirst({
    where: { id: packageId, projectId },
    include: {
      subBids: {
        include: {
          vendor: true,
          lines: { orderBy: { scopeItemKey: "asc" } },
        },
        orderBy: { bidAmount: "asc" },
      },
      levelingResults: true,
    },
  });
  if (!pkg) notFound();

  const canAward = await actorIsManager(tenant.id);

  const bidders: LevelingBidder[] = pkg.subBids.map((sb) => ({
    subBidId: sb.id,
    vendorId: sb.vendorId,
    vendorName: sb.vendor.name,
    statedTotal: sb.bidAmount,
    daysToComplete: sb.daysToComplete,
    inclusionsText: sb.inclusions,
    exclusionsText: sb.exclusions,
    lines: sb.lines.map((l) => ({
      scopeItemKey: l.scopeItemKey,
      description: l.description,
      amount: l.amount,
      inclusion: l.inclusion,
      notes: l.notes,
    })),
  }));

  const scopeRows = buildLevelingMatrix(bidders);
  const summaries = buildBidderSummaries(bidders);
  const summaryByVendor = new Map(summaries.map((s) => [s.vendorId, s]));
  const awardMap = new Map(pkg.levelingResults.map((r) => [r.scopeItemKey, r]));

  const pricedSummaries = summaries.filter((s) => s.leveledTotal > 0);
  const lowLeveled = pricedSummaries.length > 0 ? Math.min(...pricedSummaries.map((s) => s.leveledTotal)) : null;
  const spread =
    pricedSummaries.length > 1
      ? subtractMoney(Math.max(...pricedSummaries.map((s) => s.leveledTotal)), Math.min(...pricedSummaries.map((s) => s.leveledTotal)))
      : null;
  const awardedScopes = awardMap.size;

  const hasLines = scopeRows.length > 0;

  return (
    <AppLayout
      eyebrow={`${project.name} · Bid leveling`}
      title={pkg.name}
      description={`${pkg.trade} · ${pkg.subBids.length} bidder${pkg.subBids.length === 1 ? "" : "s"}. Lowest non-excluded amount highlighted per row; high outliers flagged.`}
    >
      <div className="grid gap-6">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link href={`/projects/${projectId}`} className="hover:text-cyan-200">{project.code}</Link>
          <span className="px-1.5">/</span>
          <Link href={`/projects/${projectId}/bids`} className="hover:text-cyan-200">Bids</Link>
          <span className="px-1.5">/</span>
          <Link href={`/projects/${projectId}/bids/${packageId}`} className="hover:text-cyan-200">{pkg.name}</Link>
          <span className="px-1.5">/</span>
          <span className="text-slate-300">Leveling matrix</span>
        </nav>

        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Bidders" value={pkg.subBids.length} />
          <StatTile label="Low leveled bid" value={lowLeveled !== null ? formatCurrency(lowLeveled) : "—"} tone="good" />
          <StatTile label="Spread (high − low)" value={spread !== null ? formatCurrency(spread) : "—"} tone={spread !== null && spread > 0 ? "warn" : "default"} />
          <StatTile label="Scopes awarded" value={hasLines ? `${awardedScopes} / ${scopeRows.length}` : awardedScopes} />
        </section>

        {/* Bidder summary — normalized, apples-to-apples */}
        <section className="card p-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-cyan-300">Bidder summary — normalized to included scope</h2>
          <p className="mt-1 text-xs text-slate-500">Leveled total sums only included line items (excluded scope is not priced). Lowest leveled total is the apples-to-apples low bid.</p>
          <ul className="mt-3 space-y-2">
            {summaries.map((s) => (
              <li key={s.subBidId} className="panel p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/vendors/${s.vendorId}`} className="text-sm font-medium text-white hover:text-cyan-200">{s.vendorName}</Link>
                    {s.isLowOverall ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Low bid</span> : null}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.lineCount} line{s.lineCount === 1 ? "" : "s"}
                    {s.exclusionCount > 0 ? <span className="text-rose-300"> · {s.exclusionCount} exclusion{s.exclusionCount === 1 ? "" : "s"}</span> : null}
                    {s.daysToComplete ? ` · ${s.daysToComplete} days` : ""}
                    {s.lineCount === 0 ? " · summary-only (stated total)" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{formatCurrency(s.leveledTotal)}</div>
                  {!s.isLowOverall && s.leveledTotal > 0 ? <div className="text-xs text-amber-300">+{formatCurrency(s.deltaVsLow)} vs low</div> : null}
                  {s.lineCount > 0 && Math.abs(s.statedTotal - s.leveledTotal) > 1 ? (
                    <div className="text-[10px] text-slate-500">stated {formatCurrency(s.statedTotal)}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Scope-item matrix */}
        {hasLines ? (
          <section className="card p-0 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <caption className="sr-only">Bid leveling matrix: scope items by bidder, with the lowest included amount highlighted per row.</caption>
              <thead className="bg-white/5">
                <tr>
                  <th scope="col" className="table-header sticky left-0 bg-slate-950/80">Scope item</th>
                  {pkg.subBids.map((sb) => (
                    <th scope="col" key={sb.id} className="table-header text-right">
                      <div className="text-white">{sb.vendor.name}</div>
                      <div className="text-[10px] text-slate-500">{formatCurrency(summaryByVendor.get(sb.vendorId)?.leveledTotal ?? 0)} leveled</div>
                    </th>
                  ))}
                  <th scope="col" className="table-header">Awarded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scopeRows.map((row) => {
                  const award = awardMap.get(row.scopeItemKey);
                  return (
                    <tr key={row.scopeItemKey} className="hover:bg-white/5">
                      <th scope="row" className="table-cell sticky left-0 bg-slate-950/80 text-left font-normal">
                        <div className="font-mono text-xs text-cyan-200">{row.scopeItemKey}</div>
                        <div className="text-xs text-slate-400">{row.description}</div>
                      </th>
                      {pkg.subBids.map((sb) => {
                        const cell = row.cells.get(sb.vendorId);
                        if (!cell) return <td key={sb.id} className="table-cell text-right text-slate-600">—</td>;
                        const cls = cell.isLow ? "bg-emerald-500/10 text-emerald-200" : cell.isOutlier ? "bg-rose-500/10 text-rose-200" : "";
                        return (
                          <td key={sb.id} className={`table-cell text-right ${cls}`}>
                            {!cell.inclusion ? <span className="text-rose-300 text-xs">EXCL</span> : null}
                            <div>{formatCurrency(cell.amount)}</div>
                            {cell.isOutlier ? <div className="text-[10px] uppercase tracking-wide text-rose-300">outlier</div> : null}
                            {cell.notes ? <div className="text-[10px] text-slate-500">{cell.notes}</div> : null}
                          </td>
                        );
                      })}
                      <td className="table-cell">
                        {award ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                            {pkg.subBids.find((sb) => sb.id === award.awardedToSubBidId)?.vendor.name ?? "—"}
                          </span>
                        ) : canAward ? (
                          <form action={`/api/bid-packages/${pkg.id}/award`} method="post" className="flex gap-1">
                            <input type="hidden" name="scopeItemKey" value={row.scopeItemKey} />
                            <label className="sr-only" htmlFor={`award-${row.scopeItemKey}`}>Awardee for {row.scopeItemKey}</label>
                            <select id={`award-${row.scopeItemKey}`} name="subBidId" className="form-select text-xs">
                              {pkg.subBids.map((sb) => <option key={sb.id} value={sb.id}>{sb.vendor.name}</option>)}
                            </select>
                            <button className="btn-outline text-xs">Award</button>
                          </form>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="card p-6">
            <EmptyState
              icon={Layers}
              title="No line-item bids yet"
              description="Sub bids are still summary-only. Capture each bidder's line items (with a shared scope-item key) to compare them apples-to-apples in this matrix. The bidder summary above reflects stated lump-sum totals."
            />
          </section>
        )}

        <Link href={`/projects/${projectId}/bids/${packageId}`} className="btn-outline text-xs self-start">← Back to package</Link>
      </div>
    </AppLayout>
  );
}
