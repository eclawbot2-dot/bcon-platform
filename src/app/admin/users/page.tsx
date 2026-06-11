import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { currentSuperAdmin } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

type UserRow = Awaited<ReturnType<typeof loadUsers>>[number];

async function loadUsers(where: Record<string, unknown>) {
  return prisma.user.findMany({
    where,
    include: { memberships: { include: { tenant: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export default async function AdminUsersListPage({ searchParams }: { searchParams: Promise<{ q?: string; super?: string }> }) {
  // In-page gate — layout-only checks leak page data via the parallel-rendered
  // RSC payload. See admin/audit/page.tsx.
  if (!(await currentSuperAdmin())) return null;
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }];
  if (sp.super === "1") where.superAdmin = true;

  const [users, total, superTotal, active] = await Promise.all([
    loadUsers(where),
    prisma.user.count(),
    prisma.user.count({ where: { superAdmin: true } }),
    prisma.user.count({ where: { active: true } }),
  ]);

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (u) => u.name,
    },
    {
      key: "email",
      header: "Email",
      cellClassName: "text-xs text-slate-400",
      render: (u) => u.email,
    },
    {
      key: "superAdmin",
      header: "Super admin",
      render: (u) =>
        u.superAdmin ? (
          <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">YES</span>
        ) : (
          "—"
        ),
    },
    {
      key: "active",
      header: "Active",
      render: (u) =>
        u.active ? <span className="text-emerald-300">active</span> : <span className="text-slate-500">inactive</span>,
    },
    {
      key: "tenants",
      header: "Tenants",
      cellClassName: "text-xs",
      sortValue: (u) => u.memberships.map((m) => m.tenant.slug).join(", "),
      render: (u) =>
        u.memberships.length > 0
          ? u.memberships.map((m) => `${m.tenant.slug}:${m.roleTemplate}`).join(", ")
          : "—",
    },
    {
      key: "createdAt",
      header: "Created",
      cellClassName: "text-xs text-slate-400",
      render: (u) => formatDate(u.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (u) => (
        <Link href={`/admin/users/${u.id}`} className="btn-outline text-xs">
          Manage
        </Link>
      ),
    },
  ];

  return (
    <AppLayout eyebrow="Super admin" title="User management" description="Every user across every tenant. Promote/demote super-admin status, deactivate, inspect tenant memberships.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Total users" value={total} />
          <StatTile label="Super admins" value={superTotal} tone={superTotal > 0 ? "good" : "bad"} />
          <StatTile label="Active" value={active} />
          <StatTile label="Shown" value={users.length} />
        </section>

        <section className="card p-5">
          <form method="get" className="grid gap-3 md:grid-cols-[2fr_1fr_auto_auto]">
            <label htmlFor="users-search" className="sr-only">Search users</label>
            <input id="users-search" name="q" defaultValue={sp.q ?? ""} placeholder="Search by name or email…" className="form-input" />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" name="super" value="1" defaultChecked={sp.super === "1"} /> Super admins only
            </label>
            <button className="btn-primary">Filter</button>
            <Link href="/admin/users/new" className="btn-outline">+ New user</Link>
          </form>
        </section>

        <DataTable
          columns={columns}
          rows={users}
          rowKey={(u) => u.id}
          getRowHref={(u) => `/admin/users/${u.id}`}
          emptyMessage="No users match."
        />
      </div>
    </AppLayout>
  );
}
