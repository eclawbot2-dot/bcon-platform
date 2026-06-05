import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { buildSubmittalRegister, COURT_SLA_DAYS } from "@/lib/submittal-register";
import { ClipboardList } from "lucide-react";

/**
 * Submittal log register with ball-in-court aging. Each submittal shows
 * who currently owns it (contractor vs. reviewer), how long it has sat in
 * that court, and an overdue flag once it passes the court SLA. Sorted
 * overdue-first so the schedule risk is at the top.
 */
export default async function SubmittalRegisterPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { submittals: { orderBy: { number: "asc" } } },
  });
  if (!project) notFound();

  const { rows, summary } = buildSubmittalRegister(project.submittals);

  return (
    <AppLayout
      eyebrow={`${project.code} · Submittal register`}
      title={project.name}
      description={`Ball-in-court aging. Items overdue after ${COURT_SLA_DAYS.REVIEWER} days in a court are flagged.`}
    >
      <div className="grid gap-6">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link href={`/projects/${projectId}`} className="hover:text-cyan-200">{project.code}</Link>
          <span className="px-1.5">/</span>
          <Link href={`/projects/${projectId}/submittals`} className="hover:text-cyan-200">Submittals</Link>
          <span className="px-1.5">/</span>
          <span className="text-slate-300">Register</span>
        </nav>

        <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total" value={summary.total} />
          <StatTile label="Open" value={summary.open} />
          <StatTile label="With reviewer" value={summary.withReviewer} tone="warn" />
          <StatTile label="With contractor" value={summary.withContractor} />
          <StatTile label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? "bad" : "good"} />
          <StatTile label="Avg days open" value={summary.avgDaysOpen} />
        </section>

        {rows.length === 0 ? (
          <section className="card p-6">
            <EmptyState
              icon={ClipboardList}
              title="No submittals on file"
              description="Once submittals are logged they appear here with ball-in-court aging so you can chase whoever is holding things up."
              action={<Link href={`/projects/${projectId}/submittals`} className="btn-outline text-xs">Go to submittals</Link>}
            />
          </section>
        ) : (
          <section className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <SortableTable
                emptyMessage="No submittals."
                columns={[
                  { header: "#" },
                  { header: "Title" },
                  { header: "Spec" },
                  { header: "Status" },
                  { header: "Ball in court" },
                  { header: "Responsible" },
                  { header: "Since" },
                  { header: "Days" },
                ]}
                rows={rows.map((r) => ({
                  key: r.id,
                  className: r.overdue ? "bg-rose-500/5 transition hover:bg-rose-500/10" : "transition hover:bg-white/5",
                  cells: [
                    { sort: r.number, node: r.number, tdClassName: "font-mono text-xs text-slate-400" },
                    {
                      sort: r.title,
                      node: (
                        <Link href={`/projects/${projectId}/submittals/${r.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                          {r.title}
                        </Link>
                      ),
                    },
                    { sort: r.specSection ?? "", node: r.specSection ?? "—", tdClassName: "text-slate-400" },
                    { sort: r.status, node: <StatusBadge status={r.status} /> },
                    {
                      sort: r.ballInCourt,
                      node:
                        r.ballInCourt === "CLOSED" ? (
                          <StatusBadge tone="good" label="Closed" />
                        ) : r.ballInCourt === "REVIEWER" ? (
                          <StatusBadge tone="warn" label="Reviewer" />
                        ) : (
                          <StatusBadge tone="info" label="Contractor" />
                        ),
                    },
                    { sort: r.responsibleParty, node: r.responsibleParty, tdClassName: "text-slate-300" },
                    { sort: r.inCourtSince.getTime(), node: r.ballInCourt === "CLOSED" ? "—" : formatDate(r.inCourtSince), tdClassName: "text-slate-400" },
                    {
                      sort: r.daysInCourt,
                      node:
                        r.ballInCourt === "CLOSED" ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <span className={r.overdue ? "font-semibold text-rose-300" : "text-slate-200"}>
                            {r.daysInCourt}d{r.overdue ? " ⚠" : ""}
                          </span>
                        ),
                    },
                  ],
                }))}
              />
            </div>
          </section>
        )}

        <Link href={`/projects/${projectId}/submittals`} className="btn-outline text-xs self-start">← Back to submittals</Link>
      </div>
    </AppLayout>
  );
}
