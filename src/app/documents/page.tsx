import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function DocumentsRollupPage() {
  const tenant = await requireTenant();
  const docs = await prisma.document.findMany({
    where: { project: { tenantId: tenant.id } },
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const byClass = docs.reduce<Record<string, number>>((acc, d) => { acc[d.documentClass] = (acc[d.documentClass] ?? 0) + 1; return acc; }, {});
  return (
    <AppLayout eyebrow="Document control" title="Documents" description="All drawings, specs, permits, contracts, and field records across every project.">
      <div className="grid gap-6">
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
              className="min-w-full divide-y divide-white/10"
              emptyMessage="No documents in the system yet."
              columns={[
                { header: "Document" },
                { header: "Class" },
                { header: "Project" },
                { header: "Folder" },
                { header: "Version" },
                { header: "Uploaded" },
              ]}
              rows={docs.map((d) => ({
                key: d.id,
                className: "transition hover:bg-white/5",
                cells: [
                  { sort: d.title, tdClassName: "font-medium text-white", node: d.title },
                  { sort: d.documentClass, tdClassName: "text-slate-400", node: d.documentClass },
                  { sort: d.project.code, node: <Link href={`/projects/${d.project.id}/documents`} className="text-cyan-300 hover:underline">{d.project.code}</Link> },
                  { sort: d.folderPath ?? "", tdClassName: "text-slate-400", node: d.folderPath ?? "—" },
                  { sort: d.versionLabel, node: d.versionLabel },
                  { sort: new Date(d.createdAt).getTime(), tdClassName: "text-slate-400", node: formatDate(d.createdAt) },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
