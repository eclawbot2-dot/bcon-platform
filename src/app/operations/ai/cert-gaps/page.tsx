import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { certGapDetector } from "@/lib/ops-ai";
import { requireTenant } from "@/lib/tenant";

export default async function CertGapPage() {
  const tenant = await requireTenant();
  const gaps = await certGapDetector(tenant.id);

  return (
    <AppLayout eyebrow="Ops AI" title="Certification gap detector" description="Staff assigned to roles or tasks requiring certifications they don't have on file.">
      <section className="grid gap-4 md:grid-cols-3">
        <StatTile label="Gaps detected" value={gaps.length} tone={gaps.length > 0 ? "warn" : "good"} />
      </section>
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No certification gaps detected."
          columns={[
            { header: "Employee" },
            { header: "Missing cert" },
            { header: "Required for" },
          ]}
          rows={gaps.map((g, i) => ({
            key: String(i),
            cells: [
              { sort: g.userName, node: g.userName },
              { sort: g.missingCert, node: g.missingCert, tdClassName: "font-semibold text-amber-200" },
              { sort: g.requiredFor, node: g.requiredFor, tdClassName: "text-xs text-slate-400" },
            ],
          }))}
        />
      </section>
      <Link href="/operations/ai" className="btn-outline text-xs">← back</Link>
    </AppLayout>
  );
}
