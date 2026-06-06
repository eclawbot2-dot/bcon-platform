import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";

export default async function RfpListingsPage({ searchParams }: { searchParams: Promise<{ status?: string; sourceId?: string; showBlocked?: string; q?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const where: Record<string, unknown> = { tenantId: tenant.id };
  if (sp.status) where.status = sp.status;
  if (sp.sourceId) where.sourceId = sp.sourceId;
  // Free-text search across the fields most operators recall by:
  // title, agency, solicitation number. SQLite's LIKE is case-
  // insensitive by default for ASCII, which covers virtually all
  // procurement portal data.
  if (sp.q && sp.q.trim()) {
    const needle = sp.q.trim();
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
      {
        OR: [
          { title: { contains: needle, mode: "insensitive" } },
          { agency: { contains: needle, mode: "insensitive" } },
          { solicitationNo: { contains: needle, mode: "insensitive" } },
          { naicsCode: { contains: needle, mode: "insensitive" } },
        ],
      },
    ];
  }
  // By default hide auto-blocked listings (score capped at ≤25 by a
  // matching blockKeyword on the tenant's bid profile). They're not
  // valuable triage candidates — the operator already said never bid.
  // Operators can reveal them via showBlocked=1, useful for auditing
  // whether the block list is overaggressive.
  const showBlocked = sp.showBlocked === "1";
  if (!showBlocked) {
    where.OR = [{ score: null }, { score: { gt: 25 } }];
  }
  // SQL `score <= 25` excludes NULL automatically — only counts
  // scored-and-capped listings, not unscored ones.
  const blockedCount = await prisma.rfpListing.count({ where: { tenantId: tenant.id, score: { lte: 25 } } });
  const listings = await prisma.rfpListing.findMany({ where, include: { source: true, bidDrafts: true }, orderBy: { discoveredAt: "desc" }, take: 250 });
  const counts = {
    total: await prisma.rfpListing.count({ where: { tenantId: tenant.id } }),
    new: await prisma.rfpListing.count({ where: { tenantId: tenant.id, status: "NEW" } }),
    pursuing: await prisma.rfpListing.count({ where: { tenantId: tenant.id, status: "PURSUING" } }),
    submitted: await prisma.rfpListing.count({ where: { tenantId: tenant.id, status: "SUBMITTED" } }),
  };

  return (
    <AppLayout eyebrow="BD · RFP listings" title="RFPs & solicitations" description="Every solicitation discovered by your watched sources. Filter, draft, or convert to an opportunity.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Total listings" value={counts.total} href="/bids/listings" />
          <StatTile label="New (untriaged)" value={counts.new} tone={counts.new > 0 ? "warn" : "good"} href="/bids/listings?status=NEW" />
          <StatTile label="Pursuing" value={counts.pursuing} href="/bids/listings?status=PURSUING" />
          <StatTile label="Submitted" value={counts.submitted} href="/bids/listings?status=SUBMITTED" />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between flex-wrap gap-3">
            <form method="get" className="flex items-center gap-2">
              <input type="text" name="q" defaultValue={sp.q ?? ""} placeholder="search title / agency / sol#" className="form-input text-xs w-64 normal-case tracking-normal" />
              {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
              {sp.sourceId ? <input type="hidden" name="sourceId" value={sp.sourceId} /> : null}
              {sp.showBlocked ? <input type="hidden" name="showBlocked" value={sp.showBlocked} /> : null}
              <button type="submit" className="btn-outline text-xs normal-case tracking-normal">Search</button>
              {sp.q ? <Link href={preserveQuery(sp, { q: undefined })} className="text-[10px] text-slate-500 hover:text-cyan-300 normal-case tracking-normal">clear</Link> : null}
            </form>
            <div className="flex items-center gap-3">
              <span>Recent listings</span>
              {blockedCount > 0 ? (
                showBlocked ? (
                  <Link href={preserveQuery(sp, { showBlocked: undefined })} className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-rose-200 hover:bg-rose-500/20">
                    showing {blockedCount} blocked · hide
                  </Link>
                ) : (
                  <Link href={preserveQuery(sp, { showBlocked: "1" })} className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] normal-case tracking-normal text-slate-300 hover:bg-slate-500/20">
                    {blockedCount} hidden by block keywords · show
                  </Link>
                )
              ) : null}
            </div>
            <div className="flex gap-2">
              <a href={buildExportHref(sp)} className="btn-outline text-xs" download>Export CSV</a>
              <Link href="/bids/sources" className="btn-outline text-xs">Manage sources</Link>
              <Link href="/bids/discover" className="btn-primary text-xs">Discover new portals</Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No listings yet. Refresh a source from /bids/sources or discover new portals."
              columns={[
                { header: "Score" },
                { header: "Agency" },
                { header: "Title" },
                { header: "Value" },
                { header: "NAICS" },
                { header: "Set-aside" },
                { header: "Due" },
                { header: "Status" },
                { header: "Drafts" },
                { header: "", sortable: false },
              ]}
              rows={listings.map((l) => ({
                key: l.id,
                className: "transition hover:bg-white/5",
                cells: [
                  {
                    sort: l.score ?? null,
                    tdClassName: "text-xs",
                    node: l.score == null ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${l.score >= 70 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : l.score >= 50 ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-slate-500/40 bg-slate-500/10 text-slate-300"}`}
                        title={l.scoreExplanation ?? undefined}
                      >
                        {l.score}{l.autoDrafted ? " · auto" : ""}
                      </span>
                    ),
                  },
                  { sort: l.agency, tdClassName: "text-slate-400", node: l.agency },
                  {
                    sort: l.title,
                    node: (
                      <>
                        <Link href={`/bids/listings/${l.id}`} className="font-medium text-white hover:text-cyan-200">{l.title}</Link>
                        {l.solicitationNo ? <div className="font-mono text-xs text-slate-500">{l.solicitationNo}</div> : null}
                      </>
                    ),
                  },
                  { sort: toNum(l.estimatedValue) ?? null, node: formatCurrency(l.estimatedValue) },
                  { sort: l.naicsCode ?? "", tdClassName: "font-mono text-xs text-slate-400", node: l.naicsCode ?? "—" },
                  { sort: l.setAside ?? "", tdClassName: "text-xs text-slate-400", node: l.setAside ?? "—" },
                  { sort: l.dueAt ? new Date(l.dueAt).getTime() : null, tdClassName: "text-slate-400", node: formatDate(l.dueAt) },
                  { sort: l.status, node: <StatusBadge status={l.status} /> },
                  { sort: l.bidDrafts.length, tdClassName: "text-xs text-slate-400", node: l.bidDrafts.length },
                  {
                    node: (
                      <div className="flex flex-wrap gap-1">
                        <Link href={`/bids/listings/${l.id}/score`} className="btn-outline text-xs" title="Go/no-go AI scorer">Score</Link>
                        <form action={`/api/rfp/listings/${l.id}/draft`} method="post">
                          <button className="btn-outline text-xs">Draft bid</button>
                        </form>
                        <form action={`/api/rfp/listings/${l.id}/autopilot`} method="post">
                          <button className="btn-primary text-xs" title="Draft + estimate + compliance in one click">AI autopilot</button>
                        </form>
                      </div>
                    ),
                  },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

// Build a query-string URL that toggles one parameter while preserving
// the rest. Empty/undefined values drop the parameter from the URL so
// /bids/listings stays clean when toggles are off.
/**
 * Build the export-CSV URL with all current filters propagated so the
 * file the user downloads matches what they're currently looking at.
 * Maps showBlocked→includeBlocked because the export route uses the
 * latter name.
 */
function buildExportHref(sp: { status?: string; sourceId?: string; showBlocked?: string; q?: string }): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.sourceId) params.set("sourceId", sp.sourceId);
  if (sp.showBlocked === "1") params.set("includeBlocked", "1");
  // q= isn't supported on the export route yet — title search would
  // make the export non-deterministic for casual operators. Filtering
  // by status/source on the export is the standard expectation.
  const qs = params.toString();
  return qs ? `/api/rfp/listings/export?${qs}` : "/api/rfp/listings/export";
}

function preserveQuery(current: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  // Whitelist the query params we care about so accidentally-typed
  // junk doesn't survive a clear/toggle. Drops keys whose final value
  // is undefined or empty, leaving the URL clean for shareability.
  const allowed = ["status", "sourceId", "showBlocked", "q"];
  const merged: Record<string, string | undefined> = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const k of allowed) {
    const v = merged[k];
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/bids/listings?${qs}` : "/bids/listings";
}
