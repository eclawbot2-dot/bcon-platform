import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate, lienWaiverTypeLabel } from "@/lib/utils";
import { sumMoney, toNum } from "@/lib/money";

export default async function LienWaiversPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { lienWaivers: { include: { contract: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!project) notFound();

  const received = project.lienWaivers.filter((w) => w.status === "RECEIVED").length;
  const pending = project.lienWaivers.filter((w) => w.status === "PENDING").length;
  const receivedAmount = sumMoney(project.lienWaivers.filter((w) => w.status === "RECEIVED").map((w) => w.amount));
  const pendingAmount = sumMoney(project.lienWaivers.filter((w) => w.status === "PENDING").map((w) => w.amount));

  return (
    <AppLayout eyebrow={`${project.code} · Lien waivers`} title={project.name} description="Conditional and unconditional waivers by party, tied to pay applications.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="lien-waivers" mode={project.mode} />

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Waivers on file" value={project.lienWaivers.length} />
          <Stat label="Received" value={received} tone="good" />
          <Stat label="Pending" value={pending} tone="warn" />
          <Stat label="Pending $" value={formatCurrency(pendingAmount)} tone="warn" />
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            Waiver log · {formatCurrency(receivedAmount)} received, {formatCurrency(pendingAmount)} outstanding
          </div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No lien waivers tracked."
              columns={[
                { header: "Party" },
                { header: "Type" },
                { header: "Through" },
                { header: "Amount" },
                { header: "Contract" },
                { header: "Status" },
                { header: "Received" },
              ]}
              rows={project.lienWaivers.map((w) => ({
                key: w.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  {
                    sort: w.partyName,
                    node: (
                      <Link href={`/projects/${project.id}/lien-waivers/${w.id}`} className="block">
                        <div className="font-medium text-white hover:text-cyan-200">{w.partyName}</div>
                        {w.notes ? <div className="text-xs text-slate-500">{w.notes}</div> : null}
                      </Link>
                    ),
                  },
                  { sort: lienWaiverTypeLabel(w.waiverType), node: lienWaiverTypeLabel(w.waiverType) },
                  { sort: w.throughDate ? new Date(w.throughDate).getTime() : null, node: formatDate(w.throughDate), tdClassName: "text-slate-400" },
                  { sort: toNum(w.amount), node: formatCurrency(w.amount) },
                  { sort: w.contract?.contractNumber ?? "", node: w.contract?.contractNumber ?? "—", tdClassName: "text-xs text-slate-400" },
                  { sort: w.status, node: <StatusBadge status={w.status} /> },
                  { sort: w.receivedAt ? new Date(w.receivedAt).getTime() : null, node: formatDate(w.receivedAt), tdClassName: "text-slate-400" },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return (
    <div className="panel p-4 min-w-0 overflow-hidden">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums ${toneClass}`} title={String(value)}>{value}</div>
    </div>
  );
}
