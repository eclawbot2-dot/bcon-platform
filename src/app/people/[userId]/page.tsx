import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, roleLabel } from "@/lib/utils";

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const tenant = await requireTenant();
  const user = await prisma.user.findFirst({
    where: { id: userId, memberships: { some: { tenantId: tenant.id } } },
    include: {
      memberships: { where: { tenantId: tenant.id }, include: { businessUnit: true, tenant: true } },
      tasks: { where: { project: { tenantId: tenant.id } }, include: { project: true }, orderBy: { dueDate: "asc" }, take: 25 },
      messages: { take: 10, orderBy: { createdAt: "desc" }, include: { thread: { include: { project: true } } } },
    },
  });
  if (!user) notFound();

  const roles = Array.from(new Set(user.memberships.map((m) => roleLabel(m.roleTemplate))));
  const units = Array.from(new Set(user.memberships.map((m) => m.businessUnit?.name).filter(Boolean)));
  const openTasks = user.tasks.filter((t) => t.status !== "COMPLETE").length;

  return (
    <DetailShell
      eyebrow="Team member"
      title={user.name}
      subtitle={user.email}
      crumbs={[{ label: "People", href: "/people" }, { label: user.name }]}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Roles (current tenant)" value={roles.length} sub={roles.join(" · ") || "—"} />
        <StatTile label="Business units" value={units.length} sub={units.join(" · ") || "—"} />
        <StatTile label="Open tasks" value={openTasks} tone={openTasks > 0 ? "warn" : "good"} />
        <StatTile label="Recent thread messages" value={user.messages.length} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Member detail</div>
        <DetailGrid>
          <DetailField label="Name">{user.name}</DetailField>
          <DetailField label="Email">{user.email}</DetailField>
          <DetailField label="Active">{user.active ? "Yes" : "No"}</DetailField>
          <DetailField label="Joined">{formatDate(user.createdAt)}</DetailField>
        </DetailGrid>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Role memberships</div>
        <div className="overflow-x-auto">
          <SortableTable
            className="min-w-full divide-y divide-white/10"
            emptyMessage="No memberships."
            columns={[
              { header: "Tenant" },
              { header: "Business unit" },
              { header: "Role" },
              { header: "Created" },
            ]}
            rows={user.memberships.map((m) => ({
              key: m.id,
              cells: [
                { sort: m.tenant.name, node: m.tenant.name },
                { sort: m.businessUnit?.name ?? "", node: m.businessUnit?.name ?? "—" },
                { sort: roleLabel(m.roleTemplate), node: roleLabel(m.roleTemplate) },
                { sort: new Date(m.createdAt).getTime(), node: formatDate(m.createdAt), tdClassName: "text-slate-400" },
              ],
            }))}
          />
        </div>
      </section>

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Assigned tasks</div>
        <div className="overflow-x-auto">
          <SortableTable
            className="min-w-full divide-y divide-white/10"
            emptyMessage="No tasks assigned."
            columns={[
              { header: "Project" },
              { header: "Task" },
              { header: "Priority" },
              { header: "Due" },
              { header: "Status" },
            ]}
            rows={user.tasks.map((t) => ({
              key: t.id,
              className: "transition hover:bg-white/5",
              cells: [
                { sort: t.project.code, node: <Link href={`/projects/${t.project.id}/tasks`} className="text-cyan-300 hover:underline">{t.project.code}</Link> },
                { sort: t.title, node: t.title },
                { sort: t.priority, node: t.priority },
                { sort: t.dueDate ? new Date(t.dueDate).getTime() : null, node: formatDate(t.dueDate), tdClassName: "text-slate-400" },
                { sort: t.status, node: t.status.replaceAll("_", " ") },
              ],
            }))}
          />
        </div>
      </section>
    </DetailShell>
  );
}
