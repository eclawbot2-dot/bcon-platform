import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { monthEndCloseChecklist } from "@/lib/finance-ai";
import { requireTenant } from "@/lib/tenant";

export default async function CloseChecklistPage() {
  const tenant = await requireTenant();
  const items = await monthEndCloseChecklist(tenant.id);
  const complete = items.filter((i) => i.status === "COMPLETE").length;
  const blocked = items.filter((i) => i.status === "BLOCKED").length;

  return (
    <AppLayout eyebrow="Finance AI" title="Month-end close assistant" description="AI auto-checks standard close steps. Green = verified by live data. Blocked = resolve before signoff.">
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Steps complete" value={`${complete}/${items.length}`} tone={complete === items.length ? "good" : "warn"} />
        <StatTile label="Blocked" value={blocked} tone={blocked > 0 ? "bad" : "good"} />
        <StatTile label="Ready to verify" value={items.filter((i) => i.status === "READY").length} />
        <StatTile label="Pending" value={items.filter((i) => i.status === "PENDING").length} />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No checklist items."
          columns={[
            { header: "#" },
            { header: "Checklist item" },
            { header: "Status" },
            { header: "Note" },
          ]}
          rows={items.map((it, i) => ({
            key: it.id,
            cells: [
              { sort: i + 1, node: i + 1, tdClassName: "text-slate-500" },
              { sort: it.label, node: it.label },
              { sort: it.status, node: <StatusBadge status={it.status} /> },
              { sort: it.note, node: it.note, tdClassName: "text-xs text-slate-400" },
            ],
          }))}
        />
      </section>
      <Link href="/finance" className="btn-outline text-xs">← back to finance hub</Link>
    </AppLayout>
  );
}
