import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";
import { loadedLabor } from "@/lib/timesheets";
import { toNum } from "@/lib/money";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function TimesheetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { timeEntries: { orderBy: [{ weekEnding: "desc" }, { employeeName: "asc" }] } },
  });
  if (!project) notFound();

  const totalHours = project.timeEntries.reduce((s, t) => s + t.regularHours + t.overtimeHours + t.doubleTimeHours, 0);
  const totalDollars = project.timeEntries.reduce((s, t) => s + loadedLabor(t), 0);
  const pending = project.timeEntries.filter((t) => t.status === "SUBMITTED").length;
  const rejected = project.timeEntries.filter((t) => t.status === "REJECTED").length;
  const thisWeekIso = new Date(Date.now() + ((5 - new Date().getDay()) * 86_400_000)).toISOString().slice(0, 10);

  return (
    <AppLayout eyebrow={`${project.code} · Timesheets`} title={project.name} description="Weekly crew timesheets with regular, overtime, and double-time hours tied to cost codes. Click any row to approve, edit, reject.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="timesheets" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Entries" value={project.timeEntries.length} />
          <StatTile label="Total hours" value={totalHours.toLocaleString()} />
          <StatTile label="Labor cost (loaded)" value={formatCurrency(totalDollars)} />
          <StatTile label="Pending approval" value={pending} tone={pending > 0 ? "warn" : "good"} />
          <StatTile label="Rejected" value={rejected} tone={rejected > 0 ? "bad" : "good"} />
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">New entry on this project</div>
            <div className="text-xs text-slate-500">Acting as <span className="text-white font-semibold">{actor.userName}</span>{actor.isManager ? " · can approve" : ""}</div>
          </div>
          <form action="/api/timesheets/create" method="post" className="mt-4 grid gap-3 md:grid-cols-4">
            <input type="hidden" name="projectId" value={project.id} />
            <div><label className="form-label">Employee</label><input name="employeeName" required className="form-input" /></div>
            <div><label className="form-label">Trade</label><input name="trade" className="form-input" /></div>
            <div><label className="form-label">Week ending</label><input name="weekEnding" type="date" defaultValue={thisWeekIso} required className="form-input" /></div>
            <div><label className="form-label">Rate ($/h)</label><input name="rate" type="number" step="0.01" defaultValue={45} className="form-input" /></div>
            <div><label className="form-label">Reg hrs</label><input name="regularHours" type="number" step="0.25" defaultValue={40} className="form-input" /></div>
            <div><label className="form-label">OT hrs</label><input name="overtimeHours" type="number" step="0.25" defaultValue={0} className="form-input" /></div>
            <div><label className="form-label">DT hrs</label><input name="doubleTimeHours" type="number" step="0.25" defaultValue={0} className="form-input" /></div>
            <div><label className="form-label">Cost code</label><input name="costCode" className="form-input" /></div>
            <div className="md:col-span-3"><label className="form-label">Notes</label><input name="notes" className="form-input" /></div>
            <div className="flex items-end"><button className="btn-primary w-full">Create draft</button></div>
          </form>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Entries</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No time entries yet — add one above."
              columns={[
                { header: "Employee" },
                { header: "Trade" },
                { header: "Week ending" },
                { header: "Reg" },
                { header: "OT" },
                { header: "DT" },
                { header: "Rate" },
                { header: "Loaded cost" },
                { header: "Cost code" },
                { header: "Status" },
              ]}
              rows={project.timeEntries.map((t) => {
                const loaded = loadedLabor(t);
                return {
                  key: t.id,
                  className: "cursor-pointer transition hover:bg-white/5",
                  cells: [
                    { sort: t.employeeName, node: <Link href={`/timesheets/${t.id}`} className="block font-medium text-white">{t.employeeName}</Link> },
                    { sort: t.trade ?? "", node: <Link href={`/timesheets/${t.id}`} className="block text-slate-400">{t.trade ?? "—"}</Link> },
                    { sort: new Date(t.weekEnding).getTime(), node: <Link href={`/timesheets/${t.id}`} className="block text-slate-400">{formatDate(t.weekEnding)}</Link> },
                    { sort: t.regularHours, node: <Link href={`/timesheets/${t.id}`} className="block">{t.regularHours}</Link> },
                    { sort: t.overtimeHours, node: <Link href={`/timesheets/${t.id}`} className="block">{t.overtimeHours}</Link> },
                    { sort: t.doubleTimeHours, node: <Link href={`/timesheets/${t.id}`} className="block">{t.doubleTimeHours}</Link> },
                    { sort: toNum(t.rate), node: <Link href={`/timesheets/${t.id}`} className="block">{formatCurrency(t.rate)}/h</Link> },
                    { sort: loaded, node: <Link href={`/timesheets/${t.id}`} className="block">{formatCurrency(loaded)}</Link> },
                    { sort: t.costCode ?? "", node: <Link href={`/timesheets/${t.id}`} className="block">{t.costCode ?? "—"}</Link>, tdClassName: "font-mono text-xs" },
                    { sort: t.status, node: <Link href={`/timesheets/${t.id}`} className="block"><StatusBadge status={t.status} /></Link> },
                  ],
                };
              })}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
