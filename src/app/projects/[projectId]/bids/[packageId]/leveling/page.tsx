import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { levelSubBids } from "@/lib/estimating-ai";
import { formatCurrency } from "@/lib/utils";

export default async function LevelingPage({ params }: { params: Promise<{ projectId: string; packageId: string }> }) {
  const { projectId, packageId } = await params;
  const tenant = await requireTenant();
  const pkg = await prisma.bidPackage.findFirst({ where: { id: packageId, project: { id: projectId, tenantId: tenant.id } }, include: { project: true } });
  if (!pkg) notFound();
  const result = await levelSubBids(packageId, tenant.id);

  return (
    <DetailShell
      eyebrow="AI · Bid leveling"
      title={`${pkg.trade} — leveled to apples-to-apples`}
      subtitle={result.rationale}
      crumbs={[{ label: "Projects", href: "/projects" }, { label: pkg.project.code, href: `/projects/${projectId}` }, { label: "Bids", href: `/projects/${projectId}/bids` }, { label: pkg.name, href: `/projects/${projectId}/bids/${packageId}` }, { label: "Leveling" }]}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Bidders normalized" value={result.normalized.length} />
        <StatTile label="Recommended" value={result.recommended ?? "—"} tone="good" />
        <StatTile label="Spread" value={result.normalized.length > 1 ? formatCurrency(result.normalized[result.normalized.length - 1].adjustedAmount - result.normalized[0].adjustedAmount) : "—"} />
      </section>
      {result.normalized.map((n, i) => (
        <section key={i} className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{i === 0 ? "RECOMMENDED" : `#${i + 1}`}</div>
              <div className="text-lg font-semibold text-white mt-1">{n.vendorName}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Raw / Adjusted</div>
              <div className="text-sm text-slate-400">{formatCurrency(n.bidAmount)}</div>
              <div className="min-w-0 truncate text-xl font-semibold tabular-nums text-white" title={formatCurrency(n.adjustedAmount)}>{formatCurrency(n.adjustedAmount)}</div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Inclusions</div>
              <ul className="mt-1 text-sm text-slate-200 list-disc pl-5">{n.inclusions.map((inc, j) => <li key={j}>{inc}</li>)}</ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-rose-300">Exclusions</div>
              <ul className="mt-1 text-sm text-slate-200 list-disc pl-5">{n.exclusions.length > 0 ? n.exclusions.map((ex, j) => <li key={j}>{ex}</li>) : <li className="text-slate-500 list-none">None flagged.</li>}</ul>
            </div>
          </div>
        </section>
      ))}
      <Link href={`/projects/${projectId}/bids/${packageId}`} className="btn-outline text-xs">← back to package</Link>
    </DetailShell>
  );
}
