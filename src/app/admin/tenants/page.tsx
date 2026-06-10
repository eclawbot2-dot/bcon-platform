import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { currentSuperAdmin } from "@/lib/permissions";
import { formatDate, modeLabel } from "@/lib/utils";

type TenantRow = Awaited<ReturnType<typeof loadTenants>>[number];

async function loadTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { projects: true, memberships: true, businessUnits: true } } },
  });
}

export default async function AdminTenantsListPage() {
  // In-page gate — layout-only checks leak page data via the parallel-rendered
  // RSC payload. See admin/audit/page.tsx.
  if (!(await currentSuperAdmin())) return null;
  const tenants = await loadTenants();

  const columns: DataTableColumn<TenantRow>[] = [
    { key: "name", header: "Name", render: (t) => t.name },
    { key: "slug", header: "Slug", cellClassName: "font-mono text-xs text-slate-400", render: (t) => t.slug },
    { key: "primaryMode", header: "Primary mode", render: (t) => modeLabel(t.primaryMode) },
    { key: "projects", header: "Projects", cellClassName: "text-right", render: (t) => t._count.projects },
    { key: "members", header: "Members", cellClassName: "text-right", render: (t) => t._count.memberships },
    { key: "bus", header: "BUs", cellClassName: "text-right", render: (t) => t._count.businessUnits },
    {
      key: "lastBackup",
      header: "Last backup",
      cellClassName: "text-xs",
      render: (t) => {
        if (t.lastBackupError) {
          return <span className="text-rose-300" title={t.lastBackupError}>error</span>;
        }
        if (!t.lastBackupAt) {
          return <span className="text-slate-500">never</span>;
        }
        const ageHrs = (Date.now() - new Date(t.lastBackupAt).getTime()) / (1000 * 60 * 60);
        const cls = ageHrs > 25 ? "text-rose-300" : ageHrs > 12 ? "text-amber-300" : "text-emerald-300";
        return <span className={cls}>{formatDate(t.lastBackupAt)}</span>;
      },
    },
    { key: "createdAt", header: "Created", cellClassName: "text-xs text-slate-400", render: (t) => formatDate(t.createdAt) },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <div className="flex gap-1">
          <Link href={`/admin/tenants/${t.id}`} className="btn-outline text-xs">Manage</Link>
          <form action={`/api/admin/tenants/${t.id}/switch`} method="post">
            <button className="btn-outline text-xs" title="Switch into this tenant">Switch in</button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <AppLayout eyebrow="Super admin" title="Tenant management" description="All tenants on this install. Create, configure, switch into, or disable.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Total tenants" value={tenants.length} />
          <StatTile label="Total projects (all)" value={tenants.reduce((s, t) => s + t._count.projects, 0)} />
          <StatTile label="Total memberships" value={tenants.reduce((s, t) => s + t._count.memberships, 0)} />
          <StatTile label="Business units" value={tenants.reduce((s, t) => s + t._count.businessUnits, 0)} />
        </section>

        <div className="flex gap-2">
          <Link href="/admin/tenants/new" className="btn-primary">+ Create new tenant</Link>
        </div>

        <DataTable
          columns={columns}
          rows={tenants}
          rowKey={(t) => t.id}
          getRowHref={(t) => `/admin/tenants/${t.id}`}
          emptyMessage="No tenants yet — create one above."
        />
      </div>
    </AppLayout>
  );
}
