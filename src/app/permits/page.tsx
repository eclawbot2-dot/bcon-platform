import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

type PermitRow = Awaited<ReturnType<typeof loadPermits>>[number];

async function loadPermits(tenantId: string) {
  return prisma.permit.findMany({
    where: { project: { tenantId } },
    include: { project: true, inspections: { where: { result: "FAIL" } } },
    orderBy: [{ expiresAt: "asc" }, { issuedAt: "desc" }],
  });
}

export default async function PermitsPortfolioPage() {
  const tenant = await requireTenant();
  const permits = await loadPermits(tenant.id);

  const now = Date.now();
  const ms60 = 60 * 24 * 3600 * 1000;
  const ms14 = 14 * 24 * 3600 * 1000;
  const expiring60 = permits.filter((p) => p.expiresAt && new Date(p.expiresAt).getTime() - now < ms60 && p.status === "ISSUED");
  const expiring14 = permits.filter((p) => p.expiresAt && new Date(p.expiresAt).getTime() - now < ms14 && p.status === "ISSUED");
  const expired = permits.filter((p) => p.expiresAt && new Date(p.expiresAt).getTime() < now && p.status !== "FINALED");
  const underReview = permits.filter((p) => p.status === "UNDER_REVIEW");
  const openFailures = permits.filter((p) => p.inspections.length > 0);

  const columns: DataTableColumn<PermitRow>[] = [
    { key: "project", header: "Project", sortValue: (p) => p.project.code, render: (p) => <Link href={`/projects/${p.project.id}/permits`} className="text-cyan-300 hover:underline">{p.project.code}</Link> },
    { key: "permitNumber", header: "Permit #", cellClassName: "font-mono text-xs", render: (p) => p.permitNumber },
    { key: "type", header: "Type", sortValue: (p) => p.permitType, render: (p) => p.permitType },
    { key: "jurisdiction", header: "Jurisdiction", cellClassName: "text-slate-400", render: (p) => p.jurisdiction },
    { key: "issued", header: "Issued", cellClassName: "text-slate-400", sortValue: (p) => p.issuedAt ?? null, render: (p) => formatDate(p.issuedAt) },
    { key: "expires", header: "Expires", cellClassName: "text-slate-400", sortValue: (p) => p.expiresAt ?? null, render: (p) => formatDate(p.expiresAt) },
    {
      key: "daysLeft",
      header: "Days left",
      sortValue: (p) => (p.expiresAt ? Math.round((new Date(p.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24)) : null),
      render: (p) => {
        const daysLeft = p.expiresAt ? Math.round((new Date(p.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24)) : null;
        const tone = daysLeft === null ? "text-slate-400" : daysLeft < 0 ? "text-rose-300" : daysLeft < 14 ? "text-amber-300" : daysLeft < 60 ? "text-slate-300" : "text-emerald-300";
        const text = daysLeft === null ? "—" : daysLeft < 0 ? `${Math.abs(daysLeft)}d past` : `${daysLeft}d`;
        return <span className={`font-semibold ${tone}`}>{text}</span>;
      },
    },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "failed",
      header: "Failed insp.",
      sortValue: (p) => p.inspections.length,
      render: (p) => (p.inspections.length > 0 ? <StatusBadge tone="bad" label={`${p.inspections.length} failed`} /> : <span className="text-slate-500">—</span>),
    },
    {
      key: "lookup",
      header: "",
      render: (p) => (
        <form action={`/api/permits/${p.id}/lookup`} method="post">
          <button className="btn-outline text-xs" disabled={!p.autoLookupEnabled}>{p.autoLookupEnabled ? "Sync" : "Off"}</button>
        </form>
      ),
    },
  ];

  return (
    <AppLayout eyebrow="Portfolio · Permits" title="Permit expiry watch" description="Permits across every project, sorted by expiration. Fire an auto-lookup on any permit to sync inspections from the jurisdiction.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Permits total" value={permits.length} />
          <StatTile label="Expiring in 14d" value={expiring14.length} tone={expiring14.length > 0 ? "bad" : "good"} />
          <StatTile label="Expiring in 60d" value={expiring60.length} tone={expiring60.length > 0 ? "warn" : "good"} />
          <StatTile label="Already expired" value={expired.length} tone={expired.length > 0 ? "bad" : "good"} />
          <StatTile label="With failed inspections" value={openFailures.length} tone={openFailures.length > 0 ? "warn" : "good"} />
        </section>

        <div className="flex items-center justify-between px-1 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--faint)" }}>
          <span>Permit ledger</span>
          <span>{underReview.length} under review</span>
        </div>

        <DataTable
          columns={columns}
          rows={permits}
          rowKey={(p) => p.id}
          emptyMessage="No permits in the portfolio."
        />
      </div>
    </AppLayout>
  );
}
