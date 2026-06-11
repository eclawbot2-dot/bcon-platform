import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";

type VendorRow = Awaited<ReturnType<typeof loadVendors>>[number];

async function loadVendors(tenantId: string) {
  return prisma.vendor.findMany({
    where: { tenantId },
    include: { insuranceCerts: true, subBids: true, subInvoices: true },
    orderBy: { name: "asc" },
  });
}

export default async function VendorsPage() {
  const tenant = await requireTenant();
  const vendors = await loadVendors(tenant.id);

  const approved = vendors.filter((v) => v.prequalStatus === "APPROVED").length;
  const expiring = vendors.filter((v) => v.prequalExpires && new Date(v.prequalExpires) < new Date(Date.now() + 60 * 24 * 3600 * 1000)).length;
  const insuranceLapsing = vendors.filter((v) => v.insuranceCerts.some((c) => new Date(c.expirationDate) < new Date(Date.now() + 30 * 24 * 3600 * 1000))).length;

  const columns: DataTableColumn<VendorRow>[] = [
    {
      key: "name",
      header: "Vendor",
      render: (v) => (
        <>
          <div className="font-medium">{v.name}</div>
          <div className="text-xs" style={{ color: "var(--faint)" }}>{v.legalName}</div>
        </>
      ),
    },
    { key: "trade", header: "Trade", sortValue: (v) => v.trade ?? "", render: (v) => v.trade ?? "—" },
    { key: "prequal", header: "Prequal", sortValue: (v) => v.prequalStatus, render: (v) => <StatusBadge status={v.prequalStatus} /> },
    { key: "score", header: "Score", cellClassName: "text-right", sortValue: (v) => v.prequalScore ?? null, render: (v) => v.prequalScore ?? "—" },
    { key: "emr", header: "EMR", cellClassName: "text-right", sortValue: (v) => v.emrRate ?? null, render: (v) => (v.emrRate ? v.emrRate.toFixed(2) : "—") },
    { key: "bonding", header: "Bonding", cellClassName: "text-right", sortValue: (v) => toNum(v.bondingCapacity), render: (v) => formatCurrency(v.bondingCapacity) },
    { key: "expires", header: "Expires", cellClassName: "text-xs text-slate-400", sortValue: (v) => v.prequalExpires ?? null, render: (v) => formatDate(v.prequalExpires) },
    {
      key: "certs",
      header: "Certs",
      sortValue: (v) => v.insuranceCerts.length,
      render: (v) => (
        <div className="flex flex-wrap gap-1">
          {v.insuranceCerts.map((c) => (
            <span key={c.id} className="badge-gray text-[10px]">{c.type.replace("_", " ")}</span>
          ))}
        </div>
      ),
    },
    {
      key: "activity",
      header: "Activity",
      cellClassName: "text-xs text-slate-400",
      sortValue: (v) => v.subBids.length + v.subInvoices.length,
      render: (v) => `${v.subBids.length} bid${v.subBids.length === 1 ? "" : "s"} · ${v.subInvoices.length} invoice${v.subInvoices.length === 1 ? "" : "s"}`,
    },
  ];

  return (
    <AppLayout eyebrow="Subcontractor management" title="Vendors & prequalification" description="Sub & vendor registry with insurance, EMR, bonding capacity, and prequalification status.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Registered vendors" value={vendors.length} />
          <StatTile label="Approved" value={approved} tone="good" />
          <StatTile label="Prequal expiring (60d)" value={expiring} tone={expiring > 0 ? "warn" : "good"} />
          <StatTile label="Insurance lapsing (30d)" value={insuranceLapsing} tone={insuranceLapsing > 0 ? "bad" : "good"} />
        </section>

        <DataTable
          columns={columns}
          rows={vendors}
          rowKey={(v) => v.id}
          getRowHref={(v) => `/vendors/${v.id}`}
          emptyMessage="No vendors registered."
        />
      </div>
    </AppLayout>
  );
}
