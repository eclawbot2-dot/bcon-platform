import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentSuperAdmin } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function CapitalProgramsPage() {
  // In-page gate — layout-only checks leak page data via the parallel-rendered
  // RSC payload. See admin/audit/page.tsx.
  if (!(await currentSuperAdmin())) return null;
  const tenant = await requireTenant();
  const programs = await prisma.capitalProgram.findMany({
    where: { tenantId: tenant.id },
    include: { projects: { include: { project: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppLayout eyebrow="Owner programs" title="Capital programs" description="Multi-project umbrella for owner / agency capital plans. Roll up budget, schedule, and progress across constituent projects.">
      <div className="grid gap-6">
        <section className="card p-5">
          <form action="/api/capital-programs/create" method="post" className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <input name="name" required placeholder="Program name (e.g., Bond 2024)" className="form-input" />
            <input name="ownerName" placeholder="Owner / agency name" className="form-input" />
            <input name="totalBudget" type="number" placeholder="Total budget" className="form-input" />
            <button className="btn-primary">Create</button>
          </form>
        </section>

        <section className="grid gap-4">
          {programs.map((p) => (
            <article key={p.id} className="card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{p.ownerType ?? "PROGRAM"}</div>
                  <h2 className="mt-1 min-w-0 break-words text-xl font-semibold text-white">{p.name}</h2>
                  {p.description ? <p className="mt-2 text-sm text-slate-400 max-w-2xl">{p.description}</p> : null}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Total budget</div>
                  <div className="mt-1 min-w-0 truncate text-2xl font-semibold tabular-nums text-white" title={formatCurrency(p.totalBudget)}>{formatCurrency(p.totalBudget)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{p.projects.length} project{p.projects.length === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {p.projects.map((cp) => (
                  <Link key={cp.id} href={`/projects/${cp.projectId}`} className="panel p-3 flex items-center justify-between hover:border-cyan-500/40">
                    <div>
                      <div className="text-sm text-white">{cp.project.name}</div>
                      <div className="text-xs text-slate-500">{cp.project.code} · {cp.project.stage}</div>
                    </div>
                    <div className="text-xs text-slate-400">
                      {cp.programBudget ? formatCurrency(cp.programBudget) : "—"}
                    </div>
                  </Link>
                ))}
                {p.projects.length === 0 ? <div className="text-xs text-slate-500">No projects assigned yet.</div> : null}
              </div>
              {p.startDate || p.endDate ? (
                <div className="mt-3 text-xs text-slate-500">
                  {formatDate(p.startDate)} → {formatDate(p.endDate)}
                </div>
              ) : null}
            </article>
          ))}
          {programs.length === 0 ? <div className="card p-6 text-center text-slate-400">No capital programs yet — create one above.</div> : null}
        </section>
      </div>
    </AppLayout>
  );
}
