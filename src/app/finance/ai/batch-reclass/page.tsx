import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { batchReclassifySuggest } from "@/lib/finance-ai";
import { requireTenant } from "@/lib/tenant";

export default async function BatchReclassPage() {
  const tenant = await requireTenant();
  const suggestions = await batchReclassifySuggest(tenant.id);
  const high = suggestions.filter((s) => s.confidence >= 80).length;

  return (
    <AppLayout eyebrow="Finance AI" title="Batch reclassify" description={`${suggestions.length} unreconciled journal rows reviewed; AI suggests project + cost code mapping with confidence.`}>
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Suggestions" value={suggestions.length} />
        <StatTile label="High confidence (≥ 80%)" value={high} tone="good" />
        <StatTile label="Needs review" value={suggestions.length - high} tone="warn" />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No unreconciled entries — all journals reviewed."
          columns={[
            { header: "Current project" },
            { header: "→ Suggested" },
            { header: "Current code" },
            { header: "→ Suggested" },
            { header: "Confidence" },
            { header: "Why" },
          ]}
          rows={suggestions.map((s) => ({
            key: s.journalId,
            cells: [
              { sort: s.currentProject ?? "", node: s.currentProject ?? "—" },
              { sort: s.suggestedProject ?? "", tdClassName: "font-semibold text-white", node: s.suggestedProject ?? "—" },
              { sort: s.currentCostCode ?? "", tdClassName: "font-mono text-xs", node: s.currentCostCode ?? "—" },
              { sort: s.suggestedCostCode ?? "", tdClassName: "font-mono text-xs text-emerald-200", node: s.suggestedCostCode ?? "—" },
              { sort: s.confidence, node: `${s.confidence}%` },
              { sort: s.rationale, tdClassName: "text-xs text-slate-400", node: s.rationale },
            ],
          }))}
        />
      </section>
      <Link href="/finance/journal" className="btn-outline text-xs">→ go to journal page to apply</Link>
    </AppLayout>
  );
}
