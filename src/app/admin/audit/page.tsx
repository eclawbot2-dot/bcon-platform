import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { currentSuperAdmin } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

type EventRow = Awaited<ReturnType<typeof loadEvents>>[number];

async function loadEvents(where: Record<string, unknown>) {
  return prisma.auditEvent.findMany({
    where,
    include: { actor: true, tenant: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ entityType?: string; action?: string; tenantId?: string }> }) {
  // In-page super-admin gate. The admin layout renders an access-denied shell
  // for non-admins, but App Router renders layouts and pages IN PARALLEL — a
  // layout-only check still executes the page and embeds its cross-tenant data
  // in the RSC flight payload. Every /admin page must gate itself.
  if (!(await currentSuperAdmin())) return null;
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.entityType) where.entityType = sp.entityType;
  if (sp.action) where.action = sp.action;
  if (sp.tenantId) where.tenantId = sp.tenantId;

  const [events, total, tenants] = await Promise.all([
    loadEvents(where),
    prisma.auditEvent.count(),
    prisma.tenant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
  ]);

  const columns: DataTableColumn<EventRow>[] = [
    { key: "when", header: "When", cellClassName: "text-xs text-slate-400", render: (e) => formatDateTime(e.createdAt) },
    { key: "tenant", header: "Tenant", cellClassName: "text-xs", render: (e) => e.tenant?.slug ?? e.tenantId },
    { key: "actor", header: "Actor", cellClassName: "text-xs", render: (e) => e.actor?.name ?? "—" },
    { key: "action", header: "Action", cellClassName: "font-mono text-xs", render: (e) => e.action },
    { key: "entity", header: "Entity", cellClassName: "text-xs", render: (e) => `${e.entityType}:${e.entityId.slice(0, 10)}` },
    { key: "source", header: "Source", cellClassName: "text-xs text-slate-400", render: (e) => e.source ?? "—" },
  ];

  return (
    <AppLayout eyebrow="Super admin" title="Audit log" description="Platform-wide audit events across all tenants. Filter by entity type, action, or tenant.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Total events" value={total} />
          <StatTile label="Events shown" value={events.length} />
          <StatTile label="Tenants" value={tenants.length} />
        </section>
        <section className="card p-5">
          <form method="get" className="grid gap-3 md:grid-cols-4">
            <label htmlFor="audit-entity" className="sr-only">Entity type</label>
            <input id="audit-entity" name="entityType" defaultValue={sp.entityType ?? ""} placeholder="Entity type (e.g. Tenant, Membership)" className="form-input" />
            <label htmlFor="audit-action" className="sr-only">Action</label>
            <input id="audit-action" name="action" defaultValue={sp.action ?? ""} placeholder="Action (e.g. TENANT_CREATED)" className="form-input" />
            <label htmlFor="audit-tenant" className="sr-only">Tenant</label>
            <select id="audit-tenant" name="tenantId" defaultValue={sp.tenantId ?? ""} className="form-select">
              <option value="">All tenants</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button className="btn-primary flex-1">Filter</button>
              <Link href="/admin/audit" className="btn-outline">Clear</Link>
            </div>
          </form>
        </section>

        <DataTable
          columns={columns}
          rows={events}
          rowKey={(e) => e.id}
          emptyMessage="No events match the filter."
        />
      </div>
    </AppLayout>
  );
}
