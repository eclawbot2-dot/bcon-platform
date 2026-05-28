import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { TestSourceButton } from "@/components/bids/test-source-button";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function BidSourcesPage() {
  const tenant = await requireTenant();
  const sources = await prisma.rfpSource.findMany({
    where: { tenantId: tenant.id },
    include: {
      listings: { take: 1, orderBy: { discoveredAt: "desc" } },
      // Pull catalog so the table can show whether the source is
      // backed by a real scraper (auto sweep) or is manual-only.
      catalog: { select: { scraperKind: true, scraperModule: true } },
    },
    orderBy: { label: "asc" },
  });
  const active = sources.filter((s) => s.status === "ACTIVE").length;
  const totalListings = await prisma.rfpListing.count({ where: { tenantId: tenant.id } });

  return (
    <AppLayout eyebrow="Business development" title="Watched RFP sources" description="URLs that bcon polls for new solicitations. Enable auto-refresh or trigger one manually.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Sources configured" value={sources.length} />
          <StatTile label="Active" value={active} tone="good" />
          <StatTile label="Paused / error" value={sources.length - active} tone={sources.length - active > 0 ? "warn" : "good"} />
          <StatTile label="Listings on file" value={totalListings} href="/bids/listings" />
        </section>
        <section className="card p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Scheduled sweep</div>
            <p className="text-sm text-slate-300 mt-1">
              <span className="text-white font-medium">Daily cadence = 6× per business day</span>. Each source re-polls every 4 hours; sweep-now ignores already-fresh sources.
            </p>
            <p className="text-xs text-slate-500 mt-1">External cron can POST to <span className="font-mono">/api/cron/rfp-sweep</span> to trigger programmatically.</p>
          </div>
          <form action="/api/rfp/sweep" method="post">
            <button type="submit" className="btn-primary text-sm">Run sweep now</button>
          </form>
        </section>
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Add source</div>
          <form action="/api/rfp/sources/create" method="post" className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto]">
            <input name="label" placeholder="Label — e.g. SAM.gov saved search" required className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
            <input name="url" placeholder="https://…" required className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
            <input name="naicsFilter" placeholder="NAICS (optional)" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
            <button type="submit" className="btn-primary">Watch</button>
          </form>
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage={<>No sources yet. Add one above or via <Link href="/bids/discover" className="underline">Discover</Link>.</>}
              columns={[
                { header: "Label" },
                { header: "URL" },
                { header: "Cadence" },
                { header: "NAICS" },
                { header: "Scraper" },
                { header: "Last checked" },
                { header: "Result" },
                { header: "Status" },
                { header: "Auto-draft", sortable: false },
                { header: "", sortable: false },
              ]}
              rows={sources.map((s) => {
                const kind = s.catalog?.scraperKind;
                const scraperLabel = !kind || kind === "MANUAL" || kind === "DEPRECATED" ? "manual" : `auto · ${kind.toLowerCase()}`;
                return {
                  key: s.id,
                  className: "transition hover:bg-white/5",
                  cells: [
                    { sort: s.label, node: <Link href={`/bids/listings?sourceId=${s.id}`} className="font-medium text-white hover:text-cyan-200">{s.label}</Link> },
                    { sort: s.url, tdClassName: "font-mono text-xs text-slate-400 truncate max-w-[280px]", node: <a href={s.url} target="_blank" rel="noopener" className="text-cyan-300 hover:underline">{s.url}</a> },
                    { sort: s.cadence, node: s.cadence },
                    { sort: s.naicsFilter ?? "", tdClassName: "text-slate-400", node: s.naicsFilter ?? "—" },
                    {
                      sort: scraperLabel,
                      node: !kind || kind === "MANUAL" || kind === "DEPRECATED" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">manual</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">auto · {kind.toLowerCase()}</span>
                      ),
                    },
                    { sort: s.lastCheckedAt ? new Date(s.lastCheckedAt).getTime() : null, tdClassName: "text-slate-400", node: formatDate(s.lastCheckedAt) },
                    {
                      sort: s.lastCheckNote ?? "",
                      tdClassName: "text-xs",
                      node: s.status === "ERROR" && s.lastCheckNote ? (
                        <details className="cursor-pointer">
                          <summary className="text-rose-300 hover:text-rose-200">
                            {s.lastCheckNote.slice(0, 60)}{s.lastCheckNote.length > 60 ? "…" : ""}
                          </summary>
                          <div className="mt-2 max-w-md whitespace-pre-wrap rounded bg-rose-500/5 p-2 text-[11px] text-rose-100">
                            {s.lastCheckNote}
                            <div className="mt-2 text-[10px] text-rose-300/70">
                              Common causes: SAM_GOV_API_KEY missing, portal URL moved, captcha or login wall, JS-rendered SPA.
                            </div>
                          </div>
                        </details>
                      ) : (
                        <span className="text-slate-400">{s.lastCheckNote ?? "—"}</span>
                      ),
                    },
                    { sort: s.status, node: <StatusBadge status={s.status} /> },
                    {
                      node: (
                        <form action={`/api/rfp/sources/${s.id}/auto-draft`} method="post" className="flex items-center gap-1">
                          <label className="flex items-center gap-1 text-xs" style={{ color: "var(--faint)" }}>
                            <input type="checkbox" name="autoDraftEnabled" defaultChecked={s.autoDraftEnabled} />
                            auto-draft
                          </label>
                          <input
                            name="autoDraftMinScore"
                            type="number"
                            min={0}
                            max={100}
                            defaultValue={s.autoDraftMinScore}
                            aria-label="Auto-draft minimum score"
                            className="form-input w-14 text-xs"
                          />
                          <button type="submit" className="btn-outline text-xs">Save</button>
                        </form>
                      ),
                    },
                    {
                      node: (
                        <div className="flex flex-col gap-1">
                          <form action={`/api/rfp/sources/${s.id}/refresh`} method="post">
                            <button type="submit" className="btn-outline text-xs">Refresh</button>
                          </form>
                          <TestSourceButton sourceId={s.id} />
                        </div>
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
