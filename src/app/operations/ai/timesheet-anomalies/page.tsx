import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { timesheetAnomalies } from "@/lib/ops-ai";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function TimesheetAnomaliesPage() {
  const tenant = await requireTenant();
  const flags = await timesheetAnomalies(tenant.id);
  const high = flags.filter((f) => f.severity === "HIGH").length;

  return (
    <AppLayout eyebrow="Ops AI" title="Timesheet anomaly detector" description="Scan past 90 days for impossible hours, multi-project conflicts, and likely data-entry errors.">
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Anomalies" value={flags.length} />
        <StatTile label="High" value={high} tone={high > 0 ? "bad" : "good"} />
        <StatTile label="Medium" value={flags.length - high} tone={flags.length - high > 0 ? "warn" : "good"} />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No timesheet anomalies in the last 90 days."
          columns={[
            { header: "Employee" },
            { header: "Week" },
            { header: "Severity" },
            { header: "Issue" },
          ]}
          rows={flags.map((f, i) => ({
            key: String(i),
            cells: [
              { sort: f.userName, node: f.userName },
              { sort: new Date(f.date).getTime(), node: formatDate(f.date), tdClassName: "text-xs text-slate-400" },
              { sort: f.severity, node: <StatusBadge status={f.severity} /> },
              { sort: f.issue, node: f.issue, tdClassName: "text-xs text-slate-300" },
            ],
          }))}
        />
      </section>
      <Link href="/operations/ai" className="btn-outline text-xs">← back</Link>
    </AppLayout>
  );
}
