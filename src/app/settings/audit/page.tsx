import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

/**
 * Tenant-scoped audit log. Same structure as /admin/audit but filtered
 * to the current tenant — non-super-admin users see only their own
 * tenant's history. Useful for customers who want to review their own
 * change log without needing platform-level access.
 */

type EventRow = Awaited<ReturnType<typeof loadEvents>>[number];

async function loadEvents(tenantId: string, where: Record<string, unknown>) {
  return prisma.auditEvent.findMany({
    where: { tenantId, ...where },
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/**
 * Pull the distinct entityType + action values that have ever been
 * recorded for this tenant. Lets the filter UI offer a real dropdown
 * instead of a guess-the-string textarea. Cheap query — auditEvent has
 * a (tenantId, createdAt) index and we're grouping a small column.
 */
async function loadFilterOptions(tenantId: string) {
  const [entityTypes, actions] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { tenantId },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
      take: 100,
    }),
    prisma.auditEvent.findMany({
      where: { tenantId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
      take: 200,
    }),
  ]);
  return {
    entityTypes: entityTypes.map((r) => r.entityType).filter(Boolean),
    actions: actions.map((r) => r.action).filter(Boolean),
  };
}

export default async function TenantAuditPage({ searchParams }: { searchParams: Promise<{ entityType?: string; action?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.entityType) where.entityType = sp.entityType;
  if (sp.action) where.action = sp.action;

  const [events, total, options] = await Promise.all([
    loadEvents(tenant.id, where),
    prisma.auditEvent.count({ where: { tenantId: tenant.id } }),
    loadFilterOptions(tenant.id),
  ]);

  const columns: DataTableColumn<EventRow>[] = [
    { key: "when", header: "When", cellClassName: "text-xs text-slate-400", sortValue: (e) => e.createdAt, render: (e) => formatDateTime(e.createdAt) },
    { key: "actor", header: "Actor", cellClassName: "text-xs", sortValue: (e) => e.actor?.name ?? e.actor?.email ?? "system", render: (e) => e.actor?.name ?? e.actor?.email ?? "system" },
    { key: "action", header: "Action", cellClassName: "font-mono text-xs", render: (e) => e.action },
    { key: "entity", header: "Entity", cellClassName: "text-xs", sortValue: (e) => `${e.entityType}:${e.entityId}`, render: (e) => `${e.entityType}:${e.entityId.slice(0, 12)}${e.entityId.length > 12 ? "…" : ""}` },
    { key: "source", header: "Source", cellClassName: "text-xs text-slate-400", sortValue: (e) => e.source ?? "", render: (e) => e.source ?? "—" },
  ];

  return (
    <AppLayout
      eyebrow="Settings"
      title="Audit log"
      description="Every change made within your tenant — who did what, when. Hold this for compliance evidence and security review."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Total events" value={total} />
          <StatTile label="Showing" value={events.length} />
          <StatTile label="Tenant" value={tenant.name} />
        </section>
        <section className="card p-5">
          <form method="get" className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Entity type</span>
              <select name="entityType" defaultValue={sp.entityType ?? ""} className="form-select">
                <option value="">All entity types</option>
                {options.entityTypes.map((et) => <option key={et} value={et}>{et}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Action</span>
              <select name="action" defaultValue={sp.action ?? ""} className="form-select">
                <option value="">All actions</option>
                {options.actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <div className="flex gap-2 items-end">
              <button className="btn-primary flex-1">Filter</button>
              <Link href="/settings/audit" className="btn-outline">Clear</Link>
            </div>
          </form>
        </section>

        <DataTable
          columns={columns}
          rows={events}
          rowKey={(e) => e.id}
          emptyMessage="No events yet — they'll appear as you use the app."
        />
      </div>
    </AppLayout>
  );
}
