import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { Briefcase } from "lucide-react";

type PlacementRow = Awaited<ReturnType<typeof loadPlacements>>[number];

async function loadPlacements(tenantId: string) {
  return prisma.placement.findMany({
    where: { tenantId },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    take: 100,
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, laborCategory: true } },
    },
  });
}

export default async function PlacementsPage() {
  const tenant = await requireTenant();

  const [placements, candidates, projects] = await Promise.all([
    loadPlacements(tenant.id),
    prisma.candidate.findMany({
      where: { tenantId: tenant.id, status: { in: ["OFFER", "HIRED", "INTERVIEWING", "SCREENING"] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
      take: 100,
    }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take: 100 }),
  ]);

  const active = placements.filter((p) => p.status === "ACTIVE" || p.status === "EXTENDED").length;
  const endingSoon = placements.filter((p) => {
    if (!p.endDate) return false;
    const days = (p.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days > 0 && days < 30 && p.status !== "ENDED";
  }).length;

  const columns: DataTableColumn<PlacementRow>[] = [
    {
      key: "candidate",
      header: "Candidate",
      sortValue: (p) => `${p.candidate.lastName} ${p.candidate.firstName}`,
      render: (p) => `${p.candidate.firstName} ${p.candidate.lastName}`,
    },
    { key: "category", header: "Category", cellClassName: "text-xs", sortValue: (p) => p.laborCategory ?? p.candidate.laborCategory ?? "", render: (p) => p.laborCategory ?? p.candidate.laborCategory ?? "—" },
    { key: "department", header: "Department", cellClassName: "text-xs", sortValue: (p) => p.department ?? "", render: (p) => p.department ?? "—" },
    { key: "contract", header: "Contract", cellClassName: "text-xs", sortValue: (p) => p.contractRef ?? "", render: (p) => p.contractRef ?? "—" },
    { key: "start", header: "Start", cellClassName: "text-xs", sortValue: (p) => p.startDate ?? null, render: (p) => formatDate(p.startDate) },
    {
      key: "end",
      header: "End",
      cellClassName: "text-xs",
      sortValue: (p) => p.endDate ?? null,
      render: (p) => (p.endDate ? formatDate(p.endDate) : "open-ended"),
    },
    {
      key: "rates",
      header: "Bill / Pay",
      cellClassName: "text-xs text-right",
      sortValue: (p) => (p.billRate != null ? toNum(p.billRate) : null),
      render: (p) => `$${p.billRate ?? "?"} / $${p.payRate ?? "?"}`,
    },
    { key: "status", header: "Status", render: (p) => p.status.replace(/_/g, " ") },
  ];

  return (
    <AppLayout
      eyebrow="People · Placements"
      title="Workforce placements"
      description="Active and historical placements tied to projects, contracts, and labor categories. Per req §7.1A."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Active" value={active} tone="good" />
          <StatTile label="Ending in 30d" value={endingSoon} tone={endingSoon > 0 ? "warn" : undefined} />
          <StatTile label="Total" value={placements.length} />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Record a placement</h2>
          <form action="/api/ats/placements/create" method="post" className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto]">
            <select name="candidateId" required defaultValue="" className="form-select">
              <option value="">— pick candidate —</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
            <select name="projectId" defaultValue="" className="form-select">
              <option value="">— no project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
            </select>
            <input name="contractRef" placeholder="Contract" className="form-input" />
            <input name="startDate" type="date" required className="form-input" />
            <input name="endDate" type="date" className="form-input" />
            <input name="billRate" type="number" step="0.01" placeholder="Bill" className="form-input" />
            <button className="btn-primary">Place</button>
          </form>
        </section>

        {placements.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No placements yet"
            description="Once a candidate is hired, record a placement here to track start/end dates and rate splits."
          />
        ) : (
          <DataTable columns={columns} rows={placements} rowKey={(p) => p.id} />
        )}

        <div className="text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/people/ats" className="underline">← back to ATS</Link>
        </div>
      </div>
    </AppLayout>
  );
}
