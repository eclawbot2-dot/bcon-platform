import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { detectJournalAnomalies } from "@/lib/finance-ai";
import { requireTenant } from "@/lib/tenant";

export default async function AnomaliesPage() {
  const tenant = await requireTenant();
  const findings = await detectJournalAnomalies(tenant.id);
  const high = findings.filter((f) => f.severity === "HIGH").length;
  const med = findings.filter((f) => f.severity === "MED").length;
  const low = findings.filter((f) => f.severity === "LOW").length;

  return (
    <AppLayout eyebrow="Finance AI" title="Journal anomaly detector" description="Scans the last 90 days for duplicates, round amounts, and high-value entries. Flag anything suspicious for controller review.">
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Total findings" value={findings.length} />
        <StatTile label="High severity" value={high} tone={high > 0 ? "bad" : "good"} />
        <StatTile label="Medium" value={med} tone={med > 0 ? "warn" : "good"} />
        <StatTile label="Informational" value={low} />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No anomalies detected in the last 90 days."
          columns={[
            { header: "Type" },
            { header: "Severity" },
            { header: "Description" },
            { header: "", sortable: false },
          ]}
          rows={findings.map((f, i) => ({
            key: String(i),
            cells: [
              { sort: f.type, tdClassName: "font-mono text-xs text-slate-400", node: f.type },
              { sort: f.severity, node: <StatusBadge status={f.severity} /> },
              { sort: f.description, node: f.description },
              { node: <Link href={`/finance/journal`} className="text-cyan-300 hover:underline text-xs">→ review</Link> },
            ],
          }))}
        />
      </section>
    </AppLayout>
  );
}
