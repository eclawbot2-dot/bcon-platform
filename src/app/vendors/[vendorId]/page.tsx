import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, toNum } from "@/lib/money";

export default async function VendorDetailPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const tenant = await requireTenant();
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, tenantId: tenant.id },
    include: {
      insuranceCerts: { orderBy: { expirationDate: "asc" } },
      subBids: { include: { bidPackage: { include: { project: true } } }, orderBy: { createdAt: "desc" } },
      subInvoices: { include: { project: true }, orderBy: { invoiceDate: "desc" } },
      purchaseOrders: { include: { project: true }, orderBy: { issuedAt: "desc" } },
    },
  });
  if (!vendor) notFound();

  const activeCerts = vendor.insuranceCerts.filter((c) => new Date(c.expirationDate) >= new Date());
  const expiringSoon = vendor.insuranceCerts.filter((c) => {
    const d = new Date(c.expirationDate).getTime() - Date.now();
    return d >= 0 && d < 60 * 24 * 3600 * 1000;
  });
  const invoicedTotal = sumMoney(vendor.subInvoices.map((i) => i.amount));
  const paidTotal = sumMoney(vendor.subInvoices.filter((i) => i.status === "PAID").map((i) => i.amount));
  const outstanding = sumMoney(vendor.subInvoices.filter((i) => i.status !== "PAID").map((i) => i.netDue));
  const bidWinRate = (() => {
    if (vendor.subBids.length === 0) return "—";
    const selected = vendor.subBids.filter((b) => b.status === "SELECTED").length;
    return `${Math.round((selected / vendor.subBids.length) * 100)}%`;
  })();

  return (
    <DetailShell
      eyebrow="Vendor"
      title={vendor.name}
      subtitle={`${vendor.trade ?? "—"} · ${vendor.legalName ?? vendor.name}`}
      crumbs={[{ label: "Vendors", href: "/vendors" }, { label: vendor.name }]}
      actions={<div className="flex items-center gap-2"><StatusBadge status={vendor.prequalStatus} /><Link href={`/risk/prequal?vendorId=${vendor.id}`} className="btn-outline text-xs">AI · Prequal fill</Link></div>}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Prequal score" value={vendor.prequalScore ?? "—"} sub={vendor.prequalExpires ? `expires ${formatDate(vendor.prequalExpires)}` : undefined} tone={(vendor.prequalScore ?? 0) >= 85 ? "good" : (vendor.prequalScore ?? 0) >= 70 ? "warn" : "bad"} />
        <StatTile label="Active insurance" value={activeCerts.length} sub={expiringSoon.length > 0 ? `${expiringSoon.length} expiring <60d` : undefined} tone={expiringSoon.length > 0 ? "warn" : "good"} />
        <StatTile label="EMR" value={vendor.emrRate?.toFixed(2) ?? "—"} tone={(vendor.emrRate ?? 1) <= 1 ? "good" : (vendor.emrRate ?? 1) <= 1.1 ? "warn" : "bad"} />
        <StatTile label="Bid win rate" value={bidWinRate} sub={`${vendor.subBids.length} bids`} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Invoiced lifetime" value={formatCurrency(invoicedTotal)} />
        <StatTile label="Paid lifetime" value={formatCurrency(paidTotal)} tone="good" />
        <StatTile label="Outstanding" value={formatCurrency(outstanding)} tone={outstanding > 0 ? "warn" : "good"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Vendor profile</div>
        <DetailGrid>
          <DetailField label="Name">{vendor.name}</DetailField>
          <DetailField label="Legal name">{vendor.legalName ?? "—"}</DetailField>
          <DetailField label="Trade">{vendor.trade ?? "—"}</DetailField>
          <DetailField label="Email">{vendor.email ?? "—"}</DetailField>
          <DetailField label="Phone">{vendor.phone ?? "—"}</DetailField>
          <DetailField label="Address">{vendor.address ?? "—"}</DetailField>
          <DetailField label="EIN">{vendor.ein ?? "—"}</DetailField>
          <DetailField label="Bonding capacity">{formatCurrency(vendor.bondingCapacity)}</DetailField>
          <DetailField label="EMR rate">{vendor.emrRate?.toFixed(2) ?? "—"}</DetailField>
        </DetailGrid>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Insurance certificates</div>
        <div className="overflow-x-auto">
          <SortableTable
            emptyMessage="No certificates on file."
            columns={[
              { header: "Type" },
              { header: "Carrier" },
              { header: "Policy #" },
              { header: "Limits" },
              { header: "Effective" },
              { header: "Expires" },
            ]}
            rows={vendor.insuranceCerts.map((c) => {
              const expiring = new Date(c.expirationDate).getTime() - Date.now() < 60 * 24 * 3600 * 1000;
              const expired = new Date(c.expirationDate) < new Date();
              return {
                key: c.id,
                cells: [
                  { sort: c.type, node: c.type.replaceAll("_", " ") },
                  { sort: c.carrier, node: c.carrier, tdClassName: "text-slate-400" },
                  { sort: c.policyNumber, node: c.policyNumber, tdClassName: "font-mono text-xs" },
                  { sort: toNum(c.limitEach), node: `${formatCurrency(c.limitEach)} / ${formatCurrency(c.limitAggregate)}` },
                  { sort: new Date(c.effectiveDate).getTime(), node: formatDate(c.effectiveDate), tdClassName: "text-slate-400" },
                  {
                    sort: new Date(c.expirationDate).getTime(),
                    node: (
                      <span className={expired ? "text-rose-300" : expiring ? "text-amber-300" : "text-slate-400"}>
                        {formatDate(c.expirationDate)}
                      </span>
                    ),
                  },
                ],
              };
            })}
          />
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Bid history</div>
        <div className="overflow-x-auto">
          <SortableTable
            emptyMessage="No bid history."
            columns={[
              { header: "Project" },
              { header: "Package" },
              { header: "Amount" },
              { header: "Days" },
              { header: "Status" },
            ]}
            rows={vendor.subBids.map((b) => ({
              key: b.id,
              className: "transition hover:bg-white/5",
              cells: [
                { sort: b.bidPackage.project.code, node: <Link href={`/projects/${b.bidPackage.project.id}/bids`} className="text-cyan-300 hover:underline">{b.bidPackage.project.code}</Link> },
                { sort: b.bidPackage.name, node: b.bidPackage.name },
                { sort: toNum(b.bidAmount), node: formatCurrency(b.bidAmount) },
                { sort: b.daysToComplete ?? undefined, node: b.daysToComplete ? `${b.daysToComplete}d` : "—", tdClassName: "text-slate-400" },
                { sort: b.status, node: <StatusBadge status={b.status} /> },
              ],
            }))}
          />
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Invoices</div>
        <div className="overflow-x-auto">
          <SortableTable
            emptyMessage="No invoices."
            columns={[
              { header: "Project" },
              { header: "Invoice #" },
              { header: "Amount" },
              { header: "Net due" },
              { header: "Invoiced" },
              { header: "Status" },
            ]}
            rows={vendor.subInvoices.map((i) => ({
              key: i.id,
              className: "transition hover:bg-white/5",
              cells: [
                { sort: i.project.code, node: <Link href={`/projects/${i.project.id}/sub-invoices`} className="text-cyan-300 hover:underline">{i.project.code}</Link> },
                { sort: i.invoiceNumber, node: i.invoiceNumber, tdClassName: "font-mono text-xs" },
                { sort: toNum(i.amount), node: formatCurrency(i.amount) },
                { sort: toNum(i.netDue), node: formatCurrency(i.netDue) },
                { sort: i.invoiceDate ? new Date(i.invoiceDate).getTime() : undefined, node: formatDate(i.invoiceDate), tdClassName: "text-slate-400" },
                { sort: i.status, node: <StatusBadge status={i.status} /> },
              ],
            }))}
          />
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Purchase orders</div>
        <div className="overflow-x-auto">
          <SortableTable
            emptyMessage="No POs."
            columns={[
              { header: "Project" },
              { header: "PO #" },
              { header: "Description" },
              { header: "Amount" },
              { header: "Invoiced" },
              { header: "Status" },
            ]}
            rows={vendor.purchaseOrders.map((p) => ({
              key: p.id,
              className: "transition hover:bg-white/5",
              cells: [
                { sort: p.project.code, node: <Link href={`/projects/${p.project.id}/purchase-orders`} className="text-cyan-300 hover:underline">{p.project.code}</Link> },
                { sort: p.poNumber, node: p.poNumber, tdClassName: "font-mono text-xs" },
                { sort: p.description, node: p.description },
                { sort: toNum(p.amount), node: formatCurrency(p.amount) },
                { sort: toNum(p.invoicedToDate), node: formatCurrency(p.invoicedToDate) },
                { sort: p.status, node: <StatusBadge status={p.status} /> },
              ],
            }))}
          />
        </div>
      </section>
    </DetailShell>
  );
}
