import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function CostCodesPage() {
  const tenant = await requireTenant();
  const codes = await prisma.costCode.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ code: "asc" }],
  });

  return (
    <AppLayout eyebrow="Settings · Chart of accounts" title="Cost codes" description="Hierarchical CSI MasterFormat cost codes used by budgets, invoices, and journal entries.">
      <div className="grid gap-6">
        <section className="card p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Seed CSI MasterFormat</div>
              <p className="mt-1 text-xs text-slate-400">Populates the 25 standard CSI 2020 divisions if not already present. Idempotent.</p>
            </div>
            <form action="/api/cost-codes/seed" method="post">
              <button className="btn-primary text-xs">Seed CSI defaults</button>
            </form>
          </div>
        </section>

        <section className="card p-5">
          <form action="/api/cost-codes/create" method="post" className="grid gap-3 md:grid-cols-[1fr_2fr_1fr_auto]">
            <input name="code" required placeholder="Code (e.g. 03 30 00)" className="form-input" />
            <input name="name" required placeholder="Name" className="form-input" />
            <input name="csiDivision" placeholder="CSI div (e.g. 03)" className="form-input" />
            <button className="btn-primary">Add code</button>
          </form>
        </section>

        <section className="card p-0 overflow-hidden">
          {/* Flat sortable register (spec drive-view-sortable-tables §6): the
              division is its own sortable column; the default code-ascending
              order preserves the old division grouping since CSI codes start
              with the division number. */}
          <SortableTable
            theadClassName="bg-white/5"
            initialSort={{ index: 0, dir: "asc" }}
            emptyMessage="No cost codes yet — seed the CSI defaults above."
            columns={[
              { header: "Code" },
              { header: "Name" },
              { header: "CSI division" },
              { header: "Active" },
            ]}
            rows={codes.map((c) => {
              const division = c.csiDivision ?? c.code.split(" ")[0] ?? "00";
              return {
                key: c.id,
                className: "hover:bg-white/5",
                cells: [
                  { sort: c.code, node: c.code, tdClassName: "font-mono text-xs" },
                  { sort: c.name, node: c.name },
                  { sort: division, node: <span className="text-xs text-cyan-300">Division {division}</span> },
                  { sort: c.active, node: c.active ? "✓" : "—", tdClassName: "text-xs" },
                ],
              };
            })}
          />
        </section>
      </div>
    </AppLayout>
  );
}
