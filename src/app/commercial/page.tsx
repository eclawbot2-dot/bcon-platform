import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate, formatPercent, contractTypeLabel, changeOrderKindLabel } from "@/lib/utils";
import { sumMoney, toNum } from "@/lib/money";

export default async function CommercialPage() {
  const tenant = await requireTenant();
  const projectScope = { project: { tenantId: tenant.id } } as const;
  const [projects, contracts, changeOrders, payApps, lienWaivers] = await Promise.all([
    prisma.project.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    prisma.contract.findMany({ where: projectScope, include: { project: true, commitments: true } }),
    prisma.changeOrder.findMany({ where: projectScope, include: { project: true }, orderBy: { requestedAt: "desc" } }),
    prisma.payApplication.findMany({ where: projectScope, include: { project: true, contract: true }, orderBy: { periodNumber: "desc" } }),
    prisma.lienWaiver.findMany({ where: projectScope, include: { project: true, contract: true }, orderBy: { createdAt: "desc" } }),
  ]);

  const contractedValue = sumMoney(contracts.map((c) => c.currentValue));
  const coApproved = sumMoney(changeOrders.filter((c) => c.status === "APPROVED" || c.status === "EXECUTED").map((c) => c.amount));
  const coPending = sumMoney(changeOrders.filter((c) => c.status === "PENDING" || c.status === "DRAFT").map((c) => c.amount));
  const billedToDate = sumMoney(payApps.map((p) => p.workCompletedToDate));
  const retainageHeld = sumMoney(payApps.map((p) => p.retainageHeld));
  const pendingPayment = sumMoney(payApps.filter((p) => p.status !== "PAID").map((p) => p.currentPaymentDue));
  const waiverPending = lienWaivers.filter((w) => w.status === "PENDING").length;

  return (
    <AppLayout eyebrow="Commercial controls" title="Commercial rollup" description="Contracts, change orders, progress billing, and lien waivers across every project.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Projects" value={projects.length} href="/projects" />
          <Stat label="Contracted value" value={formatCurrency(contractedValue)} />
          <Stat label="Billed to date" value={formatCurrency(billedToDate)} tone="good" />
          <Stat label="Pending payment" value={formatCurrency(pendingPayment)} tone="warn" />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Change orders approved" value={formatCurrency(coApproved)} tone="good" />
          <Stat label="Change orders pending" value={formatCurrency(coPending)} tone="warn" />
          <Stat label="Retainage held" value={formatCurrency(retainageHeld)} />
          <Stat label="Lien waivers pending" value={waiverPending} tone={waiverPending > 0 ? "warn" : "good"} />
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Contract ledger</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No contracts."
              columns={[
                { header: "Contract" },
                { header: "Project" },
                { header: "Type" },
                { header: "Counterparty" },
                { header: "Current value" },
                { header: "Retainage" },
                { header: "Status" },
              ]}
              rows={contracts.map((c) => ({
                key: c.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  {
                    sort: c.contractNumber,
                    node: (
                      <Link href={`/projects/${c.project.id}/contracts/${c.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                        <div className="font-medium">{c.contractNumber}</div>
                        <div className="text-xs text-slate-500">{c.title}</div>
                      </Link>
                    ),
                  },
                  { sort: c.project.code, node: <Link href={`/projects/${c.project.id}`} className="text-cyan-300 hover:underline">{c.project.code}</Link> },
                  { sort: contractTypeLabel(c.type), node: contractTypeLabel(c.type) },
                  { sort: c.counterparty, tdClassName: "text-slate-400", node: c.counterparty },
                  { sort: toNum(c.currentValue), node: formatCurrency(c.currentValue) },
                  { sort: c.retainagePct, node: formatPercent(c.retainagePct) },
                  { sort: c.status, node: <StatusBadge status={c.status} /> },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Change order ledger</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No change orders."
              columns={[
                { header: "#" },
                { header: "Project" },
                { header: "Kind" },
                { header: "Title" },
                { header: "Amount" },
                { header: "Schedule" },
                { header: "Status" },
                { header: "Requested" },
              ]}
              rows={changeOrders.map((co) => ({
                key: co.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: co.coNumber, tdClassName: "font-mono text-xs text-slate-400", node: co.coNumber },
                  { sort: co.project.code, node: <Link href={`/projects/${co.project.id}/change-orders`} className="text-cyan-300 hover:underline">{co.project.code}</Link> },
                  { sort: changeOrderKindLabel(co.kind), node: changeOrderKindLabel(co.kind) },
                  { sort: co.title, node: <Link href={`/projects/${co.project.id}/change-orders/${co.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{co.title}</Link> },
                  { sort: toNum(co.amount), node: formatCurrency(co.amount) },
                  { sort: co.scheduleImpactDays ?? null, node: co.scheduleImpactDays ? `${co.scheduleImpactDays}d` : "—" },
                  { sort: co.status, node: <StatusBadge status={co.status} /> },
                  { sort: co.requestedAt ? new Date(co.requestedAt).getTime() : null, tdClassName: "text-slate-400", node: formatDate(co.requestedAt) },
                ],
              }))}
            />
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Pay application pipeline</div>
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No pay applications."
              columns={[
                { header: "Project" },
                { header: "Period" },
                { header: "Range" },
                { header: "Work completed" },
                { header: "Retainage" },
                { header: "Payment due" },
                { header: "Status" },
              ]}
              rows={payApps.map((p) => ({
                key: p.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: p.project.code, node: <Link href={`/projects/${p.project.id}/pay-apps`} className="text-cyan-300 hover:underline">{p.project.code}</Link> },
                  { sort: p.periodNumber, tdClassName: "font-mono text-xs", node: <Link href={`/projects/${p.project.id}/pay-apps/${p.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">#{p.periodNumber}</Link> },
                  { sort: p.periodFrom ? new Date(p.periodFrom).getTime() : null, tdClassName: "text-slate-400", node: `${formatDate(p.periodFrom)} → ${formatDate(p.periodTo)}` },
                  { sort: toNum(p.workCompletedToDate), node: formatCurrency(p.workCompletedToDate) },
                  { sort: toNum(p.retainageHeld), node: formatCurrency(p.retainageHeld) },
                  { sort: toNum(p.currentPaymentDue), node: formatCurrency(p.currentPaymentDue) },
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

function Stat({ label, value, tone, href }: { label: string; value: string | number; tone?: "good" | "warn" | "bad"; href?: string }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  const inner = (
    <div className={`panel p-4 ${href ? "transition hover:border-cyan-500/40" : ""}`}>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {href ? <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300">View →</div> : null}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
