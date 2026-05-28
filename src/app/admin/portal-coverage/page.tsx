import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

/**
 * Operations transparency for the SolicitationPortalCatalog. Shows
 * every catalog row with:
 *
 *   - Scraper kind (auto vs manual vs deprecated)
 *   - Last verified timestamp + result + count
 *   - How many tenants are subscribed across the platform
 *
 * Lets ops staff prioritize which portals need a real scraper next:
 * sort by subscription count (high demand) and filter to MANUAL kind.
 *
 * This page does NOT live-probe portals (would slow page render and
 * be impolite to upstream). Run `npx tsx scripts/verify-html-scrapers.ts`
 * (or the eventual cron) to refresh telemetry.
 */
export default async function PortalCoveragePage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; refreshed?: string }> }) {
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.kind && ["API", "RSS", "HTML", "MANUAL", "DEPRECATED"].includes(sp.kind)) {
    where.scraperKind = sp.kind;
  }
  if (sp.status === "verified-ok") where.lastVerifiedOk = true;
  if (sp.status === "verified-fail") where.lastVerifiedOk = false;
  if (sp.status === "unverified") where.lastVerifiedAt = null;

  const [rows, totals, sourceCounts] = await Promise.all([
    prisma.solicitationPortalCatalog.findMany({
      where,
      orderBy: [{ scraperKind: "asc" }, { agencyKind: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.solicitationPortalCatalog.groupBy({
      by: ["scraperKind"],
      _count: { _all: true },
    }),
    prisma.rfpSource.groupBy({
      by: ["catalogId"],
      _count: { _all: true },
      where: { catalogId: { not: null } },
    }),
  ]);

  const subsByCatalog = new Map<string, number>();
  for (const c of sourceCounts) {
    if (c.catalogId) subsByCatalog.set(c.catalogId, c._count._all);
  }

  const total = rows.length;
  const auto = totals.filter((t) => t.scraperKind !== "MANUAL" && t.scraperKind !== "DEPRECATED").reduce((acc, t) => acc + t._count._all, 0);
  const manual = totals.find((t) => t.scraperKind === "MANUAL")?._count._all ?? 0;
  const deprecated = totals.find((t) => t.scraperKind === "DEPRECATED")?._count._all ?? 0;
  const grandTotal = totals.reduce((acc, t) => acc + t._count._all, 0);

  return (
    <AppLayout
      eyebrow="Platform operations"
      title="Portal coverage"
      description="Every catalog row, scraper status, and platform-wide subscription count. Use this to prioritize which portals need a real scraper next."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Catalog total" value={grandTotal} />
          <StatTile label="Auto-scraped" value={auto} tone="good" />
          <StatTile label="Manual" value={manual} tone={manual > auto ? "warn" : "default"} />
          <StatTile label="Deprecated" value={deprecated} tone={deprecated > 0 ? "warn" : "good"} />
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Filters</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <FilterChip label="all" href="/admin/portal-coverage" active={!sp.kind && !sp.status} />
                <FilterChip label="api" href="/admin/portal-coverage?kind=API" active={sp.kind === "API"} />
                <FilterChip label="html" href="/admin/portal-coverage?kind=HTML" active={sp.kind === "HTML"} />
                <FilterChip label="rss" href="/admin/portal-coverage?kind=RSS" active={sp.kind === "RSS"} />
                <FilterChip label="manual" href="/admin/portal-coverage?kind=MANUAL" active={sp.kind === "MANUAL"} />
                <FilterChip label="deprecated" href="/admin/portal-coverage?kind=DEPRECATED" active={sp.kind === "DEPRECATED"} />
                <span className="text-slate-600">·</span>
                <FilterChip label="verified ok" href="/admin/portal-coverage?status=verified-ok" active={sp.status === "verified-ok"} />
                <FilterChip label="verified failing" href="/admin/portal-coverage?status=verified-fail" active={sp.status === "verified-fail"} />
                <FilterChip label="never probed" href="/admin/portal-coverage?status=unverified" active={sp.status === "unverified"} />
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>showing {total} of {grandTotal}</span>
              <form action="/api/admin/verify-portals" method="post">
                <button type="submit" className="btn-outline text-xs" title="Probes every auto-scraped portal — takes a few minutes.">
                  Refresh now
                </button>
              </form>
              {sp.refreshed ? <span className="text-emerald-300">✓ refreshed</span> : null}
            </div>
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No portals match these filters."
              columns={[
                { header: "Portal" },
                { header: "Agency" },
                { header: "Scraper" },
                { header: "Subs", align: "right" },
                { header: "Last verified" },
                { header: "Result" },
              ]}
              rows={rows.map((r) => {
                const subs = subsByCatalog.get(r.id) ?? 0;
                const isAuto = r.scraperKind !== "MANUAL" && r.scraperKind !== "DEPRECATED";
                return {
                  key: r.id,
                  className: "hover:bg-white/5",
                  cells: [
                    {
                      sort: r.name,
                      node: (
                        <>
                          <a href={r.url} target="_blank" rel="noopener" className="font-medium text-cyan-300 hover:underline">{r.name}</a>
                          <div className="text-xs text-slate-500 mt-0.5">{r.category}</div>
                        </>
                      ),
                    },
                    {
                      sort: r.agencyName ?? r.agencyKind,
                      tdClassName: "text-xs text-slate-400",
                      node: (
                        <>
                          <div>{r.agencyName ?? r.agencyKind}</div>
                          <div className="text-slate-600">{[r.geoCity, r.geoState].filter(Boolean).join(", ") || r.geoScope}</div>
                        </>
                      ),
                    },
                    {
                      sort: r.scraperKind,
                      node: isAuto ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                          {r.scraperKind.toLowerCase()} · {r.scraperModule ?? "(no module)"}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${r.scraperKind === "DEPRECATED" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>
                          {r.scraperKind.toLowerCase()}
                        </span>
                      ),
                    },
                    {
                      sort: subs,
                      tdClassName: "text-slate-300",
                      node: subs > 0 ? <span className="font-medium text-white">{subs}</span> : <span className="text-slate-600">0</span>,
                    },
                    {
                      sort: r.lastVerifiedAt ? new Date(r.lastVerifiedAt).getTime() : null,
                      tdClassName: "text-xs text-slate-400",
                      node: r.lastVerifiedAt ? formatDateTime(r.lastVerifiedAt) : <span className="text-slate-600">never</span>,
                    },
                    {
                      sort: r.lastVerifiedAt == null ? null : r.lastVerifiedOk ? (r.lastVerifiedCount ?? 0) : -1,
                      tdClassName: "text-xs",
                      node: r.lastVerifiedAt == null ? (
                        <span className="text-slate-500">—</span>
                      ) : r.lastVerifiedOk ? (
                        <span className="text-emerald-300">{r.lastVerifiedCount ?? 0} listings</span>
                      ) : (
                        <span className="text-rose-300" title={r.lastVerifiedNote ?? ""}>{(r.lastVerifiedNote ?? "failed").slice(0, 60)}</span>
                      ),
                    },
                  ],
                };
              })}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 ${active ? "bg-cyan-500/20 text-cyan-100" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
    >
      {label}
    </Link>
  );
}
