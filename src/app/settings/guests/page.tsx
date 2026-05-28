import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";

/**
 * Guest accounts — owners, architects, inspectors, subs given
 * scoped read access to specific resources via magic link. Free
 * named seats (no paid license). Lets the GC bring outside
 * collaborators in without per-seat cost.
 */
export default async function GuestsPage() {
  const tenant = await requireTenant();
  const guests = await prisma.guestAccount.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppLayout eyebrow="Settings · Collaborators" title="Guest accounts" description="Free named seats for owner / architect / inspector / sub. Magic-link sign-in; scoped read access.">
      <div className="grid gap-6">
        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Invite guest</div>
          <form action="/api/tenant/guests/create" method="post" className="mt-3 grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto]">
            <input name="email" type="email" required placeholder="email@example.com" className="form-input" />
            <input name="name" placeholder="Name" className="form-input" />
            <select name="role" defaultValue="OWNER_REVIEWER" className="form-select">
              <option value="OWNER_REVIEWER">Owner / Reviewer</option>
              <option value="ARCHITECT">Architect</option>
              <option value="INSPECTOR">Inspector</option>
              <option value="SUB">Sub</option>
            </select>
            <button className="btn-primary">Invite</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Guest receives a magic link by email (no password). Access scope can be limited to specific projects via the JSON scope field.</p>
        </section>

        <section className="card p-0 overflow-hidden">
          <SortableTable
            emptyMessage="No guest accounts yet."
            columns={[
              { header: "Email" },
              { header: "Name" },
              { header: "Role" },
              { header: "Last seen" },
              { header: "Active" },
              { header: "", sortable: false },
            ]}
            rows={guests.map((g) => ({
              key: g.id,
              className: g.active ? "" : "opacity-50",
              cells: [
                { sort: g.email, node: g.email },
                { sort: g.name ?? "", node: g.name ?? "—" },
                { sort: g.role, node: g.role, tdClassName: "text-xs" },
                { sort: g.lastSeenAt ? new Date(g.lastSeenAt).getTime() : undefined, node: g.lastSeenAt ? formatDateTime(g.lastSeenAt) : "—", tdClassName: "text-xs" },
                { sort: g.active ? 1 : 0, node: g.active ? "✓" : "—" },
                {
                  node: (
                    <form action={`/api/tenant/guests/${g.id}/toggle`} method="post">
                      <button className="btn-outline text-xs">{g.active ? "Disable" : "Enable"}</button>
                    </form>
                  ),
                },
              ],
            }))}
          />
        </section>
      </div>
    </AppLayout>
  );
}
