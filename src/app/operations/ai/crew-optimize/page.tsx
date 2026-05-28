import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { crewAssignmentOptimizer } from "@/lib/ops-ai";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function CrewOptimizePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const projects = await prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true } });
  const suggestions = sp.projectId ? await crewAssignmentOptimizer(sp.projectId, tenant.id) : [];

  return (
    <AppLayout eyebrow="Ops AI" title="Crew assignment optimizer" description="Given schedule tasks + crew availability, AI suggests the best-fit crew.">
      <form method="get" className="card p-6 flex flex-wrap gap-3 items-center">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Project</label>
        <select name="projectId" defaultValue={sp.projectId ?? ""} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">— select —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
        <button className="btn-primary">Optimize</button>
        <Link href="/operations/ai" className="btn-outline text-xs">← back</Link>
      </form>
      {suggestions.length > 0 ? (
        <section className="card p-0 overflow-hidden">
          <SortableTable
            emptyMessage="No suggestions."
            columns={[
              { header: "Task" },
              { header: "Crew" },
              { header: "Confidence" },
              { header: "Why" },
            ]}
            rows={suggestions.map((s, i) => ({
              key: String(i),
              cells: [
                { sort: s.taskName, node: s.taskName },
                { sort: s.suggestedCrew, node: s.suggestedCrew, tdClassName: "font-semibold text-white" },
                { sort: s.confidence, node: `${s.confidence}%` },
                { sort: s.rationale, node: s.rationale, tdClassName: "text-xs text-slate-400" },
              ],
            }))}
          />
        </section>
      ) : null}
    </AppLayout>
  );
}
