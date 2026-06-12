import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";
import { loadedLabor } from "@/lib/timesheets";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { TimeEntryStatus } from "@prisma/client";

type TimeEntryRow = Awaited<ReturnType<typeof loadEntries>>[number];

async function loadEntries(where: Record<string, unknown>) {
  return prisma.timeEntry.findMany({
    where,
    include: { project: true },
    orderBy: [{ weekEnding: "desc" }, { employeeName: "asc" }],
    take: 500,
  });
}

const STATUS_OPTIONS: Array<TimeEntryStatus | "ALL"> = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"];

export default async function TimesheetsRollupPage({ searchParams }: { searchParams: Promise<{ status?: string; projectId?: string; employee?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const actor = await currentActor(tenant.id);

  const where: Record<string, unknown> = { project: { tenantId: tenant.id } };
  if (sp.status && sp.status !== "ALL") where.status = sp.status;
  if (sp.projectId) where.projectId = sp.projectId;
  if (sp.employee) where.employeeName = { contains: sp.employee, mode: "insensitive" };

  const [entries, projects, statusCounts] = await Promise.all([
    loadEntries(where),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true } }),
    prisma.timeEntry.groupBy({
      by: ["status"],
      where: { project: { tenantId: tenant.id } },
      _count: { _all: true },
    }),
  ]);
  const statusMap = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  const totalHours = entries.reduce((s, t) => s + t.regularHours + t.overtimeHours + t.doubleTimeHours, 0);
  const totalCost = entries.reduce((s, t) => s + loadedLabor(t), 0);
  const pending = entries.filter((t) => t.status === "SUBMITTED").length;
  const rejected = entries.filter((t) => t.status === "REJECTED").length;

  const thisWeekIso = new Date(Date.now() + ((5 - new Date().getDay()) * 86_400_000)).toISOString().slice(0, 10);

  return (
    <AppLayout eyebrow="Labor" title="Timesheets — portfolio" description="Weekly time cards across every project. Click any row to review, edit, approve, or reject.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Entries shown" value={entries.length} />
          <StatTile label="Logged hours" value={totalHours.toLocaleString()} />
          <StatTile label="Loaded labor" value={formatCurrency(totalCost)} />
          <StatTile label="Pending approval" value={pending} tone={pending > 0 ? "warn" : "good"} href="/timesheets?status=SUBMITTED" />
          <StatTile label="Rejected" value={rejected} tone={rejected > 0 ? "bad" : "good"} href="/timesheets?status=REJECTED" />
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Filters</div>
            <div className="text-xs text-slate-500">Acting as <span className="text-white font-semibold">{actor.userName}</span> · <span className="font-mono text-cyan-200">{actor.role ?? "—"}</span>{actor.isManager ? " · can approve" : " · read-only for approvals"}</div>
          </div>
          <form method="get" className="mt-4 grid gap-3 md:grid-cols-5">
            <div>
              <label className="form-label">Status</label>
              <select name="status" defaultValue={sp.status ?? "ALL"} className="form-select">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}{s !== "ALL" && statusMap[s] !== undefined ? ` (${statusMap[s]})` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Project</label>
              <select name="projectId" defaultValue={sp.projectId ?? ""} className="form-select">
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Employee</label>
              <input name="employee" defaultValue={sp.employee ?? ""} placeholder="name contains…" className="form-input" />
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full">Apply</button>
            </div>
            <div className="flex items-end">
              <Link href="/timesheets" className="btn-outline w-full">Clear</Link>
            </div>
          </form>
        </section>

        <section className="card p-5 min-w-0 overflow-hidden">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">New time entry</div>
          <form action="/api/timesheets/create" method="post" className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="md:col-span-1">
              <label className="form-label">Project</label>
              <select name="projectId" required className="form-select">
                <option value="">— select —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
            </div>
            <div><label className="form-label">Employee</label><input name="employeeName" required className="form-input" /></div>
            <div><label className="form-label">Trade</label><input name="trade" className="form-input" /></div>
            <div><label className="form-label">Week ending</label><input name="weekEnding" type="date" defaultValue={thisWeekIso} required className="form-input" /></div>
            <div><label className="form-label">Reg hrs</label><input name="regularHours" type="number" step="0.25" defaultValue={40} className="form-input" /></div>
            <div><label className="form-label">OT hrs</label><input name="overtimeHours" type="number" step="0.25" defaultValue={0} className="form-input" /></div>
            <div><label className="form-label">DT hrs</label><input name="doubleTimeHours" type="number" step="0.25" defaultValue={0} className="form-input" /></div>
            <div><label className="form-label">Rate ($/h)</label><input name="rate" type="number" step="0.01" defaultValue={45} className="form-input" /></div>
            <div className="md:col-span-2"><label className="form-label">Cost code</label><input name="costCode" className="form-input" /></div>
            <div className="md:col-span-2"><label className="form-label">Notes</label><input name="notes" className="form-input" /></div>
            <div className="md:col-span-4"><button className="btn-primary">Create draft entry</button></div>
          </form>
        </section>

        <DataTable
          columns={
            [
              { key: "project", header: "Project", cellClassName: "text-cyan-300", sortValue: (t) => t.project.code, render: (t) => t.project.code },
              { key: "employeeName", header: "Employee", render: (t) => t.employeeName },
              { key: "weekEnding", header: "Week ending", cellClassName: "text-xs text-slate-400", render: (t) => formatDate(t.weekEnding) },
              {
                key: "hours",
                header: "Hours",
                sortValue: (t) => t.regularHours + t.overtimeHours + t.doubleTimeHours,
                render: (t) => {
                  const hours = t.regularHours + t.overtimeHours + t.doubleTimeHours;
                  return <>{hours} <span className="text-xs text-slate-500">({t.regularHours}/{t.overtimeHours}/{t.doubleTimeHours})</span></>;
                },
              },
              { key: "loaded", header: "Loaded", cellClassName: "text-xs text-right", sortValue: (t) => loadedLabor(t), render: (t) => formatCurrency(loadedLabor(t)) },
              { key: "costCode", header: "Cost code", cellClassName: "font-mono text-xs", render: (t) => t.costCode ?? "—" },
              { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
            ] as DataTableColumn<TimeEntryRow>[]
          }
          rows={entries}
          rowKey={(t) => t.id}
          getRowHref={(t) => `/timesheets/${t.id}`}
          emptyMessage="No entries matching filters."
        />
      </div>
    </AppLayout>
  );
}
