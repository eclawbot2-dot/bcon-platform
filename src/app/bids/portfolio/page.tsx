import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { addMoney, toNum } from "@/lib/money";

/**
 * BD pipeline summary for the current tenant. Shows where the bid
 * pipeline stands at a glance — total estimated value being pursued,
 * win rate, time-to-decision distribution, recent auto-drafts. Lets
 * the operator answer "is the pipeline healthy?" without clicking
 * into individual listings.
 */
export default async function BidsPortfolioPage() {
  const tenant = await requireTenant();

  const [
    byStatus,
    valuesByStatus,
    autoDraftRecent,
    sources,
    topListings,
    avgScoreRow,
  ] = await Promise.all([
    prisma.rfpListing.groupBy({
      by: ["status"],
      where: { tenantId: tenant.id },
      _count: { _all: true },
    }),
    prisma.rfpListing.groupBy({
      by: ["status"],
      where: { tenantId: tenant.id },
      _sum: { estimatedValue: true },
    }),
    prisma.rfpListing.findMany({
      where: { tenantId: tenant.id, autoDrafted: true },
      orderBy: { autoDraftedAt: "desc" },
      take: 8,
    }),
    prisma.rfpSource.count({ where: { tenantId: tenant.id, status: "ACTIVE" } }),
    prisma.rfpListing.findMany({
      where: { tenantId: tenant.id, score: { not: null } },
      orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
      take: 10,
    }),
    prisma.rfpListing.aggregate({
      where: { tenantId: tenant.id, score: { not: null } },
      _avg: { score: true },
    }),
  ]);

  const countByStatus = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const valueByStatus = (s: string) => valuesByStatus.find((r) => r.status === s)?._sum.estimatedValue ?? 0;

  const submittedCount = countByStatus("SUBMITTED") + countByStatus("WON") + countByStatus("LOST");
  const wonCount = countByStatus("WON");
  const winRate = submittedCount > 0 ? Math.round((wonCount / submittedCount) * 100) : null;
  const pursuingValue = addMoney(valueByStatus("QUALIFIED"), valueByStatus("PURSUING"));
  const avgScore = avgScoreRow._avg.score ?? null;

  const total = byStatus.reduce((s, r) => s + r._count._all, 0);

  return (
    <AppLayout
      eyebrow="BD · Pipeline"
      title="Bid portfolio"
      description="Where your pipeline stands. Use this to gauge BD health, not individual listing detail — click into /bids/listings for that."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Active sources" value={sources} href="/bids/sources" />
          <StatTile label="Listings on file" value={total} href="/bids/listings" />
          <StatTile label="Pursuing value" value={formatCurrency(pursuingValue)} tone={pursuingValue > 0 ? "good" : "default"} />
          <StatTile label="Win rate" value={winRate == null ? "—" : `${winRate}%`} sub={submittedCount > 0 ? `${wonCount}/${submittedCount}` : "no submissions yet"} tone={winRate == null ? "default" : winRate >= 30 ? "good" : "warn"} />
        </section>

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Pipeline funnel</div>
          <p className="mt-1 text-xs text-slate-400">Listings by status — what's queued, what you're chasing, what closed.</p>
          <div className="mt-4 grid gap-2">
            {["NEW", "TRIAGED", "QUALIFIED", "PURSUING", "SUBMITTED", "WON", "LOST", "DECLINED"].map((status) => {
              const count = countByStatus(status);
              const value = valueByStatus(status);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={status} className="grid grid-cols-[120px_60px_1fr_140px] items-center gap-3 text-sm">
                  <Link href={`/bids/listings?status=${status}`} className="text-slate-200 hover:text-cyan-300">{status}</Link>
                  <div className="text-right text-slate-400">{count}</div>
                  <div className="h-2 rounded bg-slate-800 overflow-hidden">
                    <div className={`h-full ${status === "WON" ? "bg-emerald-500" : status === "LOST" || status === "DECLINED" ? "bg-rose-500" : "bg-cyan-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-xs text-slate-500">{formatCurrency(value)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Top-scoring open listings</div>
              <p className="mt-1 text-xs text-slate-400">Highest match scores against your bid profile, regardless of status.</p>
            </div>
            <div className="text-xs text-slate-500">avg score: {avgScore == null ? "—" : Math.round(avgScore)}</div>
          </div>
          <div className="mt-4">
            <SortableTable
              emptyMessage="No scored listings yet — set up a bid profile and subscribe to portals."
              columns={[
                { header: "Score" },
                { header: "Title" },
                { header: "Agency" },
                { header: "Value", align: "right" },
                { header: "Due" },
              ]}
              rows={topListings.map((l) => ({
                key: l.id,
                className: "hover:bg-white/5",
                cells: [
                  {
                    sort: l.score ?? null,
                    node: <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${l.score! >= 70 ? "bg-emerald-500/10 text-emerald-300" : l.score! >= 50 ? "bg-amber-500/10 text-amber-300" : "bg-slate-500/10 text-slate-300"}`}>{l.score}</span>,
                  },
                  { sort: l.title, node: <Link href={`/bids/listings/${l.id}`} className="text-white hover:text-cyan-200">{l.title.slice(0, 80)}</Link> },
                  { sort: l.agency, tdClassName: "text-slate-400", node: l.agency },
                  { sort: toNum(l.estimatedValue) ?? null, tdClassName: "text-slate-400", node: formatCurrency(l.estimatedValue) },
                  { sort: l.dueAt ? new Date(l.dueAt).getTime() : null, tdClassName: "text-slate-400", node: formatDate(l.dueAt) ?? "—" },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Recent auto-drafts</div>
          <p className="mt-1 text-xs text-slate-400">Listings that scored above the auto-draft threshold and got an AI-generated draft created automatically.</p>
          {autoDraftRecent.length > 0 ? (
            <ul className="mt-3 divide-y divide-white/5 text-sm">
              {autoDraftRecent.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between">
                  <Link href={`/bids/listings/${l.id}`} className="text-cyan-300 hover:underline">{l.title.slice(0, 80)}</Link>
                  <span className="text-xs text-slate-500">{l.autoDraftedAt ? formatDate(l.autoDraftedAt) : "—"} · score {l.score ?? "?"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 text-sm text-slate-500">No auto-drafts yet. Enable auto-draft on a source at /bids/sources and ensure your bid profile is set.</div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
