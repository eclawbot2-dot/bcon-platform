import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { validateLienWaiver } from "@/lib/compliance-ai";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function LienWaiverValidatorPage({ searchParams }: { searchParams: Promise<{ waiverId?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const waivers = await prisma.lienWaiver.findMany({ where: { project: { tenantId: tenant.id } }, include: { project: true }, orderBy: { createdAt: "desc" }, take: 50 });
  const validation = sp.waiverId ? await validateLienWaiver(sp.waiverId, tenant.id) : null;

  return (
    <AppLayout eyebrow="AI · Risk" title="Lien waiver validator" description="Run AI validation before releasing payment to subs.">
      <form method="get" className="card p-6 flex flex-wrap gap-3 items-center">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Waiver</label>
        <select name="waiverId" defaultValue={sp.waiverId ?? ""} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">— select —</option>
          {waivers.map((w) => <option key={w.id} value={w.id}>{w.project.code} — {w.partyName} — ${w.amount.toLocaleString()}</option>)}
        </select>
        <button className="btn-primary">Validate</button>
        <Link href="/risk" className="btn-outline text-xs">← back</Link>
      </form>
      {validation ? (
        <>
          <section className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Recommendation</div>
            <div className="mt-2 text-lg font-semibold text-white">{validation.recommendation}</div>
          </section>
          <section className="card p-0 overflow-hidden">
            <SortableTable
              emptyMessage="No findings."
              columns={[
                { header: "Field" },
                { header: "Status" },
                { header: "Note" },
              ]}
              rows={validation.findings.map((f, i) => ({
                key: String(i),
                cells: [
                  { sort: f.field, node: f.field },
                  { sort: f.status, node: <StatusBadge status={f.status} /> },
                  { sort: f.note, node: f.note, tdClassName: "text-xs text-slate-400" },
                ],
              }))}
            />
          </section>
        </>
      ) : null}
    </AppLayout>
  );
}
