import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function PermitsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      permits: {
        include: { inspections: { orderBy: { scheduledAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) notFound();

  const active = project.permits.filter((p) => p.status === "ISSUED" || p.status === "UNDER_REVIEW").length;
  const expiring = project.permits.filter((p) => p.expiresAt && new Date(p.expiresAt).getTime() - Date.now() < 60 * 24 * 3600 * 1000 && p.status === "ISSUED").length;
  const totalInspections = project.permits.reduce((s, p) => s + p.inspections.length, 0);
  const failed = project.permits.reduce((s, p) => s + p.inspections.filter((i) => i.result === "FAIL").length, 0);

  return (
    <AppLayout eyebrow={`${project.code} · Permits`} title={project.name} description="Permit applications, issued permits, jurisdiction inspection lookup, and compliance aging.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="permits" mode={project.mode} />
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Permits on file" value={project.permits.length} />
          <StatTile label="Active / in review" value={active} />
          <StatTile label="Expiring (60d)" value={expiring} tone={expiring > 0 ? "warn" : "good"} />
          <StatTile label="Inspection failures" value={failed} tone={failed > 0 ? "bad" : "good"} sub={`${totalInspections} total inspections`} />
        </section>

        {project.permits.map((p) => (
          <section key={p.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{p.permitType}</div>
                <div className="mt-1 text-lg font-semibold text-white">{p.permitNumber}</div>
                <div className="text-xs text-slate-500">{p.jurisdiction} · {p.scopeDescription ?? "—"}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={p.status} />
                <form action={`/api/permits/${p.id}/lookup`} method="post">
                  <button type="submit" className="btn-outline text-xs" disabled={!p.autoLookupEnabled}>
                    {p.autoLookupEnabled ? "Sync inspections" : "Enable auto-lookup"}
                  </button>
                </form>
                {p.lastLookupAt ? (
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    Last sync: {formatDate(p.lastLookupAt)} · {p.lastLookupStatus}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="panel p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Applied</div><div className="mt-1 text-sm text-white">{formatDate(p.appliedAt)}</div></div>
              <div className="panel p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Issued</div><div className="mt-1 text-sm text-white">{formatDate(p.issuedAt)}</div></div>
              <div className="panel p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Expires</div><div className="mt-1 text-sm text-white">{formatDate(p.expiresAt)}</div></div>
              <div className="panel p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Finaled</div><div className="mt-1 text-sm text-white">{formatDate(p.finaledAt)}</div></div>
            </div>
            {p.inspections.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <SortableTable
                  className="min-w-full divide-y divide-white/10"
                  columns={[
                    { header: "Kind" },
                    { header: "Title" },
                    { header: "Inspector" },
                    { header: "Scheduled" },
                    { header: "Completed" },
                    { header: "Result" },
                  ]}
                  rows={p.inspections.map((insp) => ({
                    key: insp.id,
                    cells: [
                      { sort: insp.kind, node: insp.kind.replaceAll("_", " ") },
                      { sort: insp.title, node: insp.title },
                      { sort: insp.inspector ?? "", node: insp.inspector ?? "—", tdClassName: "text-slate-400" },
                      { sort: insp.scheduledAt ? new Date(insp.scheduledAt).getTime() : null, node: formatDate(insp.scheduledAt), tdClassName: "text-slate-400" },
                      { sort: insp.completedAt ? new Date(insp.completedAt).getTime() : null, node: formatDate(insp.completedAt), tdClassName: "text-slate-400" },
                      { sort: insp.result ?? "", node: <StatusBadge status={insp.result} /> },
                    ],
                  }))}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-500">
                No inspections synced yet. {p.autoLookupEnabled ? "Click Sync inspections above." : "Enable auto-lookup to pull inspections from the jurisdiction."}
              </div>
            )}
          </section>
        ))}
        {project.permits.length === 0 ? <div className="card p-8 text-center text-slate-500">No permits on file.</div> : null}
      </div>
    </AppLayout>
  );
}
