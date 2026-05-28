import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { reviewSubmittalAgainstSpec } from "@/lib/execution-ai";

export default async function SubmittalReviewPage({ params }: { params: Promise<{ projectId: string; submittalId: string }> }) {
  const { projectId, submittalId } = await params;
  const tenant = await requireTenant();
  const s = await prisma.submittal.findFirst({ where: { id: submittalId, project: { id: projectId, tenantId: tenant.id } }, include: { project: true } });
  if (!s) notFound();
  const result = await reviewSubmittalAgainstSpec(submittalId, tenant.id);

  return (
    <DetailShell
      eyebrow="AI · Submittal compliance"
      title={s.title}
      subtitle={`Spec ${s.specSection ?? "—"} · ${result.recommendation}`}
      crumbs={[{ label: "Projects", href: "/projects" }, { label: s.project.code, href: `/projects/${projectId}` }, { label: "Submittals", href: `/projects/${projectId}/submittals` }, { label: s.number, href: `/projects/${projectId}/submittals/${submittalId}` }, { label: "Review" }]}
      actions={<StatusBadge status={result.overall} />}
    >
      <section className="card p-0 overflow-hidden">
        <SortableTable
          emptyMessage="No findings."
          columns={[
            { header: "Requirement" },
            { header: "Status" },
            { header: "Note" },
          ]}
          rows={result.findings.map((f, i) => ({
            key: String(i),
            cells: [
              { sort: f.requirement, node: f.requirement },
              { sort: f.status, node: <StatusBadge status={f.status} /> },
              { sort: f.note, node: f.note, tdClassName: "text-xs text-slate-400" },
            ],
          }))}
        />
      </section>
      <Link href={`/projects/${projectId}/submittals/${submittalId}`} className="btn-outline text-xs">← back</Link>
    </DetailShell>
  );
}
