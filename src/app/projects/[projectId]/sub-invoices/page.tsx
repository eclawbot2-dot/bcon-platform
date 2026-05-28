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
import { sumMoney, toNum } from "@/lib/money";

export default async function SubInvoicesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { subInvoices: { include: { vendor: true }, orderBy: { invoiceDate: "desc" } } },
  });
  if (!project) notFound();

  const totalGross = sumMoney(project.subInvoices.map((i) => i.amount));
  const retainageHeld = sumMoney(project.subInvoices.map((i) => i.retainageHeld));
  const netDue = sumMoney(project.subInvoices.filter((i) => i.status !== "PAID").map((i) => i.netDue));

  return (
    <AppLayout eyebrow={`${project.code} · Sub invoices`} title={project.name} description="Subcontractor pay applications with retainage, compliance, and waiver tracking.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="sub-invoices" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Invoices on file" value={project.subInvoices.length} />
          <StatTile label="Gross billed" value={formatCurrency(totalGross)} />
          <StatTile label="Retainage held" value={formatCurrency(retainageHeld)} tone="warn" />
          <StatTile label="Net due" value={formatCurrency(netDue)} tone={netDue > 0 ? "warn" : "good"} />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No sub invoices."
              columns={[
                { header: "Vendor" },
                { header: "Invoice #" },
                { header: "Amount" },
                { header: "Retainage" },
                { header: "Net due" },
                { header: "Invoiced" },
                { header: "Due" },
                { header: "Waiver" },
                { header: "Status" },
              ]}
              rows={project.subInvoices.map((i) => ({
                key: i.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  {
                    sort: i.vendor.name,
                    node: (
                      <>
                        <div className="font-medium text-white">{i.vendor.name}</div>
                        <div className="text-xs text-slate-500">{i.description}</div>
                      </>
                    ),
                  },
                  { sort: i.invoiceNumber, node: <Link href={`/projects/${project.id}/sub-invoices/${i.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{i.invoiceNumber}</Link>, tdClassName: "font-mono text-xs" },
                  { sort: toNum(i.amount), node: formatCurrency(i.amount) },
                  { sort: toNum(i.retainageHeld), node: formatCurrency(i.retainageHeld) },
                  { sort: toNum(i.netDue), node: formatCurrency(i.netDue) },
                  { sort: i.invoiceDate ? new Date(i.invoiceDate).getTime() : null, node: formatDate(i.invoiceDate), tdClassName: "text-slate-400" },
                  { sort: i.dueDate ? new Date(i.dueDate).getTime() : null, node: formatDate(i.dueDate), tdClassName: "text-slate-400" },
                  { sort: i.waiverReceived ? 1 : 0, node: i.waiverReceived ? <StatusBadge tone="good" label="Received" /> : <StatusBadge tone="warn" label="Pending" /> },
                  { sort: i.status, node: <StatusBadge status={i.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
