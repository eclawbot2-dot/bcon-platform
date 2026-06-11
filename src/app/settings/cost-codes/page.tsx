import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function CostCodesPage() {
  const tenant = await requireTenant();
  const codes = await prisma.costCode.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ code: "asc" }],
  });

  // Group by csiDivision for the tree view.
  const byDivision = new Map<string, typeof codes>();
  for (const c of codes) {
    const key = c.csiDivision ?? c.code.split(" ")[0] ?? "00";
    const list = byDivision.get(key) ?? [];
    list.push(c);
    byDivision.set(key, list);
  }
  const divisionsSorted = Array.from(byDivision.entries()).sort(([a], [b]) => a.localeCompare(b));

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
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="table-header">Code</th>
                <th className="table-header">Name</th>
                <th className="table-header">CSI division</th>
                <th className="table-header">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {divisionsSorted.map(([div, list]) => (
                <>
                  <tr key={`hdr-${div}`} className="bg-white/[0.02]">
                    <td colSpan={4} className="px-3 py-2 text-xs uppercase tracking-[0.16em] text-cyan-300">Division {div}</td>
                  </tr>
                  {list.map((c) => (
                    <tr key={c.id} className="hover:bg-white/5">
                      <td className="table-cell font-mono text-xs">{c.code}</td>
                      <td className="table-cell">{c.name}</td>
                      <td className="table-cell text-xs text-slate-400">{c.csiDivision ?? "—"}</td>
                      <td className="table-cell text-xs">{c.active ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </>
              ))}
              {codes.length === 0 ? <tr><td colSpan={4} className="table-cell text-center text-slate-500 py-4">No cost codes yet — seed the CSI defaults above.</td></tr> : null}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
