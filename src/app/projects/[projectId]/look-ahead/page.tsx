import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

/**
 * Last-Planner / pull-planning look-ahead view. One column per week,
 * one row per crew/sub. Each cell shows commitments — planned items
 * for that week. PPC (percent-plan-complete) renders at the top.
 */
export default async function LookAheadPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) notFound();

  const weeksAhead = 6;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Snap to Monday.
  const dow = today.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  today.setUTCDate(today.getUTCDate() - offsetToMonday);
  const weeks: Date[] = [];
  for (let i = -1; i < weeksAhead; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i * 7);
    weeks.push(d);
  }

  const earliest = weeks[0]!;
  const latest = new Date(weeks[weeks.length - 1]!);
  latest.setUTCDate(latest.getUTCDate() + 7);

  const commitments = await prisma.lookAheadCommitment.findMany({
    where: { projectId, weekStarting: { gte: earliest, lt: latest } },
    orderBy: [{ responsibleParty: "asc" }, { weekStarting: "asc" }],
  });

  // Group by responsibleParty
  const partyMap = new Map<string, typeof commitments>();
  for (const c of commitments) {
    const list = partyMap.get(c.responsibleParty) ?? [];
    list.push(c);
    partyMap.set(c.responsibleParty, list);
  }
  const parties = Array.from(partyMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  // PPC: planned-and-actual / planned over the past 4 completed weeks.
  const past = commitments.filter((c) => c.plannedComplete);
  const ppc = past.length > 0 ? Math.round((past.filter((c) => c.actualComplete).length / past.length) * 100) : null;

  return (
    <AppLayout
      eyebrow={`${project.name} · Look-ahead`}
      title="Pull-plan / Last Planner"
      description="6-week look-ahead with commitments by crew. PPC measured weekly."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Tile label="Open commitments" value={commitments.filter((c) => !c.actualComplete).length} />
          <Tile label="Closed in window" value={commitments.filter((c) => c.actualComplete).length} />
          <Tile label="PPC (rolling)" value={ppc == null ? "—" : `${ppc}%`} tone={ppc != null && ppc < 70 ? "warn" : "good"} />
        </section>

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Add commitment</div>
          <form action={`/api/projects/${projectId}/look-ahead/create`} method="post" className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr_1fr_auto]">
            <input name="weekStarting" type="date" required defaultValue={today.toISOString().slice(0, 10)} className="form-input" />
            <input name="description" required placeholder="Commitment (e.g., Pour mat slab grid 1-5)" className="form-input" />
            <input name="responsibleParty" required placeholder="Crew / sub (e.g., Concrete sub)" className="form-input" />
            <button className="btn-primary">Add</button>
          </form>
        </section>

        <section className="card p-0 overflow-x-auto">
          <SortableTable
            emptyMessage="No commitments yet — add above."
            columns={[
              { header: "Crew / sub", thClassName: "sticky left-0 bg-slate-950/80" },
              ...weeks.map((w) => ({ header: formatDate(w), thClassName: "text-xs", sortable: false as const })),
            ]}
            rows={parties.map(([party, list]) => ({
              key: party,
              cells: [
                { sort: party, node: party, tdClassName: "sticky left-0 bg-slate-950/80 font-medium" },
                ...weeks.map((w) => {
                  const cell = list.filter((c) => sameWeek(c.weekStarting, w));
                  return {
                    node: (
                      <>
                        {cell.map((c) => (
                          <div key={c.id} className={`mb-1 rounded p-1.5 ${c.actualComplete ? "bg-emerald-500/10 text-emerald-200" : c.plannedComplete ? "bg-rose-500/10 text-rose-200" : "bg-cyan-500/10 text-cyan-100"}`}>
                            <div>{c.description}</div>
                            {c.reasonNotComplete ? <div className="text-[10px] text-rose-300 mt-1">⚠ {c.reasonNotComplete}</div> : null}
                          </div>
                        ))}
                      </>
                    ),
                    tdClassName: "align-top text-xs",
                  };
                }),
              ],
            }))}
          />
        </section>
      </div>
    </AppLayout>
  );
}

function sameWeek(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" }) {
  const color = tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-white";
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
