import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, subtractMoney, toNum } from "@/lib/money";

export default async function PurchaseOrdersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { purchaseOrders: { include: { vendor: true }, orderBy: { issuedAt: "desc" } } },
  });
  if (!project) notFound();

  const total = sumMoney(project.purchaseOrders.map((p) => p.amount));
  const invoiced = sumMoney(project.purchaseOrders.map((p) => p.invoicedToDate));

  return (
    <AppLayout eyebrow={`${project.code} · Purchase orders`} title={project.name} description="Material POs with vendor, expected delivery, and invoice-to-date tracking.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="purchase-orders" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Open POs" value={project.purchaseOrders.length} />
          <StatTile label="Committed" value={formatCurrency(total)} />
          <StatTile label="Invoiced" value={formatCurrency(invoiced)} tone="good" />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No purchase orders."
              columns={[
                { header: "PO #" },
                { header: "Vendor" },
                { header: "Description" },
                { header: "Amount" },
                { header: "Invoiced" },
                { header: "Remaining" },
                { header: "Expected" },
                { header: "Status" },
              ]}
              rows={project.purchaseOrders.map((p) => ({
                key: p.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: p.poNumber, node: <Link href={`/projects/${project.id}/purchase-orders/${p.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{p.poNumber}</Link>, tdClassName: "font-mono text-xs" },
                  { sort: p.vendor.name, node: p.vendor.name },
                  { sort: p.description, node: p.description },
                  { sort: toNum(p.amount), node: formatCurrency(p.amount) },
                  { sort: toNum(p.invoicedToDate), node: formatCurrency(p.invoicedToDate) },
                  { sort: subtractMoney(p.amount, p.invoicedToDate), node: formatCurrency(subtractMoney(p.amount, p.invoicedToDate)) },
                  { sort: p.expectedDelivery ? new Date(p.expectedDelivery).getTime() : null, node: formatDate(p.expectedDelivery), tdClassName: "text-slate-400" },
                  { sort: p.status, node: <StatusBadge status={p.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
