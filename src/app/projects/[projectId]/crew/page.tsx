import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireProjectForTenant } from "@/lib/project-guard";
import { formatDate } from "@/lib/utils";
import { HardHat } from "lucide-react";

type CrewRow = Awaited<ReturnType<typeof loadCrewAssignments>>[number];

async function loadCrewAssignments(projectId: string) {
  return prisma.crewAssignment.findMany({
    where: { projectId },
    orderBy: [{ assignedDate: "desc" }, { crewName: "asc" }],
    take: 100,
  });
}

export default async function ProjectCrewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireTenant();
  const project = await requireProjectForTenant(projectId, {});
  const assignments = await loadCrewAssignments(projectId);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = assignments.filter((a) => {
    const d = new Date(a.assignedDate); d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;
  const totalPlanned = assignments.reduce((sum, a) => sum + (a.plannedHeadcount ?? 0), 0);
  const totalActual = assignments.reduce((sum, a) => sum + (a.actualHeadcount ?? 0), 0);

  const columns: DataTableColumn<CrewRow>[] = [
    { key: "assignedDate", header: "Date", cellClassName: "text-xs", render: (a) => formatDate(a.assignedDate) },
    { key: "crewName", header: "Crew", render: (a) => a.crewName },
    { key: "foreman", header: "Foreman", cellClassName: "text-xs", render: (a) => a.foreman ?? "—" },
    { key: "activity", header: "Activity", cellClassName: "text-xs", render: (a) => a.activity ?? "—" },
    { key: "costCode", header: "Cost code", cellClassName: "text-xs font-mono", render: (a) => a.costCode ?? "—" },
    { key: "shift", header: "Shift", cellClassName: "text-xs", render: (a) => a.shift ?? "—" },
    {
      key: "headcount",
      header: "Headcount (P/A)",
      cellClassName: "text-xs text-right",
      sortValue: (a) => a.actualHeadcount ?? a.plannedHeadcount,
      render: (a) => `${a.plannedHeadcount} / ${a.actualHeadcount}`,
    },
    {
      key: "hours",
      header: "Hours (P/A)",
      cellClassName: "text-xs text-right",
      sortValue: (a) => a.actualHours ?? a.plannedHours,
      render: (a) => `${a.plannedHours} / ${a.actualHours}`,
    },
    {
      key: "geo",
      header: "Station / Seg",
      cellClassName: "text-xs",
      sortValue: (a) => [a.station, a.segment].filter(Boolean).join(" · "),
      render: (a) => [a.station, a.segment].filter(Boolean).join(" · ") || "—",
    },
  ];

  return (
    <AppLayout
      eyebrow={`${project.code} · crew`}
      title="Daily crew assignments"
      description="Crew × day × cost code × activity for self-perform planning. Per req §7.12 (heavy civil)."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Today's crews" value={todayCount} />
          <StatTile label="Planned headcount (window)" value={totalPlanned} />
          <StatTile label="Actual headcount (window)" value={totalActual} />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Plan a crew assignment</h2>
          <form action={`/api/projects/${projectId}/crew-assignments/create`} method="post" className="grid gap-3 sm:grid-cols-2 md:grid-cols-[auto_1fr_1fr_1fr_1fr_auto_auto_auto]">
            <input name="assignedDate" type="date" required aria-label="Assigned date" className="form-input" />
            <input name="crewName" required placeholder="Crew name" aria-label="Crew name" className="form-input" />
            <input name="foreman" placeholder="Foreman" aria-label="Foreman" className="form-input" />
            <input name="activity" placeholder="Activity" aria-label="Activity" className="form-input" />
            <input name="costCode" placeholder="Cost code" aria-label="Cost code" className="form-input" />
            <input name="plannedHeadcount" type="number" min={0} placeholder="HC" aria-label="Planned headcount" className="form-input w-20" />
            <input name="plannedHours" type="number" step="0.5" min={0} placeholder="Hrs" aria-label="Planned hours" className="form-input w-20" />
            <button className="btn-primary">Assign</button>
          </form>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
            Re-submitting the same (date, crew, cost code) updates the existing row. Geotag fields (station, segment, lat/lon) supported via API for now.
          </p>
        </section>

        {assignments.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title="No crew assignments yet"
            description="Plan a crew on a date with the form above. Assignments link back to a daily log when one exists for that date."
          />
        ) : (
          <DataTable columns={columns} rows={assignments} rowKey={(a) => a.id} />
        )}

        <div className="text-xs" style={{ color: "var(--faint)" }}>
          <Link href={`/projects/${projectId}`} className="underline">← back to project</Link>
        </div>
      </div>
    </AppLayout>
  );
}
