import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { clientLtvPredict } from "@/lib/client-ai";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency } from "@/lib/utils";

export default async function ClvPage() {
  const tenant = await requireTenant();
  const clients = await clientLtvPredict(tenant.id);
  const chase = clients.filter((c) => c.strategy === "CHASE").length;
  const projected = clients.reduce((s, c) => s + c.projected5Y, 0);

  return (
    <AppLayout eyebrow="AI · CRM" title="Client lifetime value" description="Five-year projected revenue per client with suggested BD strategy.">
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Clients" value={clients.length} />
        <StatTile label="5y projected" value={formatCurrency(projected)} tone="good" />
        <StatTile label="CHASE" value={chase} tone="good" />
        <StatTile label="DROP" value={clients.filter((c) => c.strategy === "DROP").length} tone="warn" />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No clients on file yet."
          columns={[
            { header: "Client" },
            { header: "Past value" },
            { header: "5y projected" },
            { header: "Retention" },
            { header: "Strategy" },
            { header: "Why" },
          ]}
          rows={clients.map((c) => ({
            key: c.clientName,
            cells: [
              { sort: c.clientName, tdClassName: "font-medium text-white", node: c.clientName },
              { sort: c.past5Y, node: formatCurrency(c.past5Y) },
              { sort: c.projected5Y, tdClassName: "font-semibold text-white", node: formatCurrency(c.projected5Y) },
              { sort: c.retention, node: `${c.retention}%` },
              { sort: c.strategy, node: <StatusBadge status={c.strategy} /> },
              { sort: c.rationale, tdClassName: "text-xs text-slate-400", node: c.rationale },
            ],
          }))}
        />
      </section>
    </AppLayout>
  );
}
