import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { currentSuperAdmin } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  // In-page gate — layout-only checks leak page data via the parallel-rendered
  // RSC payload. See admin/audit/page.tsx.
  if (!(await currentSuperAdmin())) return null;
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { tenant: true, businessUnit: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user) notFound();

  return (
    <DetailShell
      eyebrow="Super admin · User"
      title={user.name}
      subtitle={user.email}
      crumbs={[{ label: "Admin", href: "/admin" }, { label: "Users", href: "/admin/users" }, { label: user.name }]}
      actions={user.superAdmin ? <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-200">SUPER ADMIN</span> : null}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Memberships" value={user.memberships.length} />
        <StatTile label="Active" value={user.active ? "Yes" : "No"} tone={user.active ? "good" : "warn"} />
        <StatTile label="Super admin" value={user.superAdmin ? "Yes" : "No"} tone={user.superAdmin ? "good" : "default"} />
        <StatTile label="Last login" value={formatDate(user.lastLoginAt) || "—"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Identity</div>
        <form action={`/api/admin/users/${user.id}/edit`} method="post" className="mt-4 grid gap-3 md:grid-cols-2">
          <div><label className="form-label">Name</label><input name="name" defaultValue={user.name} className="form-input" /></div>
          <div><label className="form-label">Email</label><input name="email" type="email" defaultValue={user.email} className="form-input" /></div>
          <div className="md:col-span-2"><button className="btn-primary">Save</button></div>
        </form>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Platform permissions</div>
        <DetailGrid>
          <DetailField label="User id"><span className="font-mono text-xs">{user.id}</span></DetailField>
          <DetailField label="Created">{formatDate(user.createdAt)}</DetailField>
          <DetailField label="Super admin">{user.superAdmin ? "Yes" : "No"}</DetailField>
          <DetailField label="Active">{user.active ? "Yes" : "No"}</DetailField>
        </DetailGrid>
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={`/api/admin/users/${user.id}/super-admin`} method="post">
            <input type="hidden" name="superAdmin" value={user.superAdmin ? "0" : "1"} />
            <button className={user.superAdmin ? "btn-outline text-xs" : "btn-primary text-xs"}>{user.superAdmin ? "Demote from super admin" : "Promote to super admin"}</button>
          </form>
          <form action={`/api/admin/users/${user.id}/activate`} method="post">
            <input type="hidden" name="active" value={user.active ? "0" : "1"} />
            <button className="btn-outline text-xs">{user.active ? "Deactivate" : "Reactivate"}</button>
          </form>
          <form action={`/api/admin/users/${user.id}/reset-password`} method="post">
            <button className="btn-outline text-xs">Reset password</button>
          </form>
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Tenant memberships · {user.memberships.length}</div>
        <div className="mt-4">
          <SortableTable
            emptyMessage="User has no tenant memberships."
            columns={[
              { header: "Tenant" },
              { header: "Role" },
              { header: "Business unit" },
              { header: "Joined" },
              { header: "", sortable: false },
            ]}
            rows={user.memberships.map((m) => ({
              key: m.id,
              cells: [
                { sort: m.tenant.name, node: <Link href={`/admin/tenants/${m.tenantId}`} className="text-cyan-300 hover:underline">{m.tenant.name}</Link> },
                {
                  sort: m.roleTemplate,
                  tdClassName: "font-mono text-xs",
                  node: (
                    <>
                      {m.roleTemplate}
                      {m.roleTemplate === "ADMIN" ? <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">TENANT ADMIN</span> : null}
                    </>
                  ),
                },
                { sort: m.businessUnit?.name ?? "", tdClassName: "text-xs", node: m.businessUnit?.name ?? "—" },
                { sort: new Date(m.createdAt).getTime(), tdClassName: "text-xs text-slate-400", node: formatDate(m.createdAt) },
                { node: <Link href={`/admin/tenants/${m.tenantId}`} className="btn-outline text-xs">Manage</Link> },
              ],
            }))}
          />
        </div>
      </section>

      <section className="card p-6 border-rose-500/30">
        <div className="text-xs uppercase tracking-[0.2em] text-rose-300">Danger zone</div>
        <p className="mt-2 text-sm text-slate-300">Deleting a user removes all their memberships across every tenant. This cannot be undone.</p>
        <form action={`/api/admin/users/${user.id}/delete`} method="post" className="mt-4 flex gap-3">
          <input name="confirm" placeholder={`Type "${user.email}" to confirm`} required className="form-input flex-1" />
          <button className="btn-danger">Delete user</button>
        </form>
      </section>
    </DetailShell>
  );
}
