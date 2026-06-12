import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, roleLabel } from "@/lib/utils";

export default async function PeoplePage() {
  const tenant = await requireTenant();
  const users = await prisma.user.findMany({
    where: { memberships: { some: { tenantId: tenant.id } } },
    include: { memberships: { where: { tenantId: tenant.id }, include: { businessUnit: true, tenant: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <AppLayout eyebrow="People" title="People & roles" description="Team members, role templates, and business-unit assignments across the tenant.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Total team members" value={users.length} />
          <Stat label="Active" value={users.filter((u) => u.active).length} tone="good" />
          <Stat label="Memberships" value={users.reduce((s, u) => s + u.memberships.length, 0)} />
          <Stat label="Role templates in use" value={Array.from(new Set(users.flatMap((u) => u.memberships.map((m) => m.roleTemplate)))).length} />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No team members yet."
              columns={[
                { header: "Name" },
                { header: "Email" },
                { header: "Roles" },
                { header: "Business units" },
                { header: "Active since" },
              ]}
              rows={users.map((u) => {
                const roles = Array.from(new Set(u.memberships.map((m) => roleLabel(m.roleTemplate)))).join(", ");
                const bus = u.memberships.map((m) => m.businessUnit?.name).filter(Boolean).join(", ");
                return {
                  key: u.id,
                  className: "cursor-pointer transition hover:bg-white/5",
                  cells: [
                    {
                      sort: u.name,
                      node: <Link href={`/people/${u.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{u.name}</Link>,
                      tdClassName: "font-medium",
                    },
                    { sort: u.email, node: u.email, tdClassName: "text-slate-400" },
                    { sort: roles, node: roles || "—" },
                    { sort: bus, node: bus || "—", tdClassName: "text-slate-400" },
                    { sort: new Date(u.createdAt).getTime(), node: formatDate(u.createdAt), tdClassName: "text-slate-400" },
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

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return <div className="panel p-4 min-w-0 overflow-hidden"><div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div><div className={`mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums ${toneClass}`} title={String(value)}>{value}</div></div>;
}
