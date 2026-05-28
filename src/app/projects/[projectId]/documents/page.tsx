import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) notFound();

  const byClass = project.documents.reduce<Record<string, number>>((acc, d) => { acc[d.documentClass] = (acc[d.documentClass] ?? 0) + 1; return acc; }, {});

  return (
    <AppLayout eyebrow={`${project.code} · Documents`} title={project.name} description="Drawings, specs, permits, contracts, photos — organized by class and folder.">
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="documents" mode={project.mode} />
        <section className="grid gap-3 md:grid-cols-4 lg:grid-cols-6">
          {Object.entries(byClass).map(([cls, count]) => (
            <div key={cls} className="panel p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{cls}</div>
              <div className="mt-2 text-xl font-semibold text-white">{count}</div>
            </div>
          ))}
        </section>
        <section className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No documents uploaded."
              columns={[
                { header: "Title" },
                { header: "Class" },
                { header: "Folder" },
                { header: "Version" },
                { header: "Uploaded" },
              ]}
              rows={project.documents.map((d) => ({
                key: d.id,
                cells: [
                  { sort: d.title, node: d.title },
                  { sort: d.documentClass, node: d.documentClass, tdClassName: "text-slate-400" },
                  { sort: d.folderPath ?? "", node: d.folderPath ?? "—", tdClassName: "text-slate-400" },
                  { sort: d.versionLabel, node: d.versionLabel },
                  { sort: new Date(d.createdAt).getTime(), node: formatDate(d.createdAt), tdClassName: "text-slate-400" },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
