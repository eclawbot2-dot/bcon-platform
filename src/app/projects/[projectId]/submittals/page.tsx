import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function SubmittalsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { submittals: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) notFound();

  const longLead = project.submittals.filter((s) => s.longLead).length;
  const approved = project.submittals.filter((s) => s.status === "APPROVED").length;

  return (
    <AppLayout eyebrow={`${project.code} · Submittals`} title={project.name} description="Shop drawings and material approvals routed by spec section.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="submittals" mode={project.mode} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/submittals/register`} className="btn-outline text-xs">Register · ball-in-court aging</Link>
        </div>
        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Total submittals" value={project.submittals.length} />
          <Stat label="Long-lead items" value={longLead} tone="warn" />
          <Stat label="Approved" value={approved} tone="good" />
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No submittals on file."
              columns={[
                { header: "#" },
                { header: "Title" },
                { header: "Spec section" },
                { header: "Long-lead" },
                { header: "Status" },
              ]}
              rows={project.submittals.map((s) => ({
                key: s.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: s.number, node: s.number, tdClassName: "font-mono text-xs text-slate-400" },
                  { sort: s.title, node: <Link href={`/projects/${project.id}/submittals/${s.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{s.title}</Link> },
                  { sort: s.specSection ?? "", node: s.specSection ?? "—", tdClassName: "text-slate-400" },
                  { sort: s.longLead ? 1 : 0, node: s.longLead ? <StatusBadge tone="warn" label="Long lead" /> : "—" },
                  { sort: s.status, node: <StatusBadge status={s.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  return <div className="panel p-4 min-w-0 overflow-hidden"><div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div><div className={`mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums ${toneClass}`} title={String(value)}>{value}</div></div>;
}
