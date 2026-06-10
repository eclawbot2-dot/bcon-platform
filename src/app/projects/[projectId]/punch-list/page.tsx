import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function PunchListPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { punchItems: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) notFound();

  const open = project.punchItems.filter((p) => p.status !== "CLOSED" && p.status !== "APPROVED").length;

  return (
    <AppLayout eyebrow={`${project.code} · Punch list`} title={project.name} description="Pre-completion deficiency tracking by area.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="punch-list" mode={project.mode} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/projects/${project.id}/punch-list/draft`} className="btn-primary text-xs">AI · Draft punch item</Link>
        </div>
        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Total items" value={project.punchItems.length} />
          <Stat label="Open" value={open} tone="warn" />
          <Stat label="Closed" value={project.punchItems.length - open} tone="good" />
        </section>
        <section className="card p-5">
          <details>
            <summary className="cursor-pointer select-none text-xs uppercase tracking-[0.2em] text-cyan-300">+ Add punch item</summary>
            <form action={`/api/projects/${project.id}/punch-list/create`} method="post" className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="form-label">Title</span>
                <input name="title" required placeholder="e.g. Drywall touch-up, south wall L2" className="form-input" />
              </label>
              <label className="block">
                <span className="form-label">Area</span>
                <input name="area" placeholder="e.g. Level 2 corridor" className="form-input" />
              </label>
              <label className="block">
                <span className="form-label">Trade</span>
                <input name="trade" placeholder="e.g. DRYWALL" className="form-input" />
              </label>
              <label className="block">
                <span className="form-label">Assigned to</span>
                <input name="assignedTo" placeholder="Sub / crew responsible" className="form-input" />
              </label>
              <label className="block">
                <span className="form-label">Due date</span>
                <input name="dueDate" type="date" className="form-input" />
              </label>
              <label className="block md:col-span-3">
                <span className="form-label">Description</span>
                <textarea name="description" rows={2} className="form-textarea" />
              </label>
              <div className="md:col-span-3">
                <button className="btn-primary text-xs">Create punch item</button>
              </div>
            </form>
          </details>
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No punch items recorded."
              columns={[
                { header: "Title" },
                { header: "Area" },
                { header: "Due" },
                { header: "Status" },
              ]}
              rows={project.punchItems.map((p) => ({
                key: p.id,
                className: "cursor-pointer transition hover:bg-white/5",
                cells: [
                  { sort: p.title, node: <Link href={`/projects/${project.id}/punch-list/${p.id}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">{p.title}</Link> },
                  { sort: p.area ?? "", node: p.area ?? "—", tdClassName: "text-slate-400" },
                  { sort: p.dueDate ? new Date(p.dueDate).getTime() : null, node: formatDate(p.dueDate), tdClassName: "text-slate-400" },
                  { sort: p.status, node: <StatusBadge status={p.status} /> },
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
  return <div className="panel p-4"><div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div><div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div></div>;
}
