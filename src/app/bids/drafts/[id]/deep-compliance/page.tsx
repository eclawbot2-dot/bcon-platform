import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { deepComplianceCheck } from "@/lib/sales-ai";

export default async function DeepCompliancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenant();
  const draft = await prisma.bidDraft.findFirst({ where: { id, tenantId: tenant.id } });
  if (!draft) notFound();
  const result = await deepComplianceCheck(id);

  return (
    <DetailShell
      eyebrow="AI · Deep compliance"
      title={`Requirement-by-requirement assessment`}
      subtitle={result.summary}
      crumbs={[{ label: "Bid Hub", href: "/bids" }, { label: draft.title, href: `/bids/drafts/${id}` }, { label: "Deep compliance" }]}
      actions={<StatusBadge status={result.overall} />}
    >
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No findings."
          columns={[
            { header: "Category" },
            { header: "Requirement" },
            { header: "Status" },
            { header: "Note" },
          ]}
          rows={result.findings.map((f, i) => ({
            key: String(i),
            cells: [
              { sort: f.category, tdClassName: "font-mono text-xs text-slate-400", node: f.category },
              { sort: f.requirement, node: f.requirement },
              { sort: f.status, node: <StatusBadge status={f.status} /> },
              { sort: f.note, tdClassName: "text-xs text-slate-400", node: f.note },
            ],
          }))}
        />
      </section>
      <div className="mt-4">
        <Link href={`/bids/drafts/${id}`} className="btn-outline text-xs">← back to draft</Link>
      </div>
    </DetailShell>
  );
}
