import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(tenantId: string) {
  return prisma.inspectionSyncRun.findMany({
    where: { tenantId },
    include: { portal: { select: { name: true, slug: true } } },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
}

export default async function InspectionRunsPage() {
  const tenant = await requireTenant();
  const rows = await loadRows(tenant.id);

  const columns: DataTableColumn<Row>[] = [
    { key: "started", header: "Started", sortValue: (r) => r.startedAt, render: (r) => formatDate(r.startedAt) },
    { key: "portal", header: "Portal", sortValue: (r) => r.portal.name, render: (r) => r.portal.name },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "fetched", header: "Fetched", sortValue: (r) => r.inspectionsFetched, render: (r) => r.inspectionsFetched },
    { key: "created", header: "Created", sortValue: (r) => r.inspectionsCreated, render: (r) => r.inspectionsCreated },
    { key: "updated", header: "Updated", sortValue: (r) => r.inspectionsUpdated, render: (r) => r.inspectionsUpdated },
    { key: "alerts", header: "Alerts", sortValue: (r) => r.alertsCreated, render: (r) => r.alertsCreated },
    { key: "duration", header: "ms", cellClassName: "text-slate-500 text-xs", sortValue: (r) => r.durationMs ?? null, render: (r) => r.durationMs ?? "—" },
    { key: "error", header: "Note", cellClassName: "text-slate-400 text-xs", render: (r) => r.errorMessage ?? (JSON.parse(r.warningsJson || "[]") as string[]).slice(0, 1)[0] ?? "" },
  ];

  return (
    <AppLayout
      eyebrow="Inspections · Sync"
      title="Sync history"
      description="Every inspections-sync cron invocation, newest first. Failures and warnings surface here so ops can spot adapter regressions."
    >
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage="No sync runs yet." />
    </AppLayout>
  );
}
