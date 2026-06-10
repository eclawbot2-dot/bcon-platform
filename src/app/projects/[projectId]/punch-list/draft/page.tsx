import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailShell } from "@/components/layout/detail-shell";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { punchFromPhotoDescription } from "@/lib/execution-ai";

export default async function PunchDraftPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ desc?: string }> }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) notFound();

  const desc = sp.desc ?? "";
  const draft = desc ? await punchFromPhotoDescription(desc) : null;

  return (
    <DetailShell
      eyebrow="AI · Punch from field description"
      title="Describe the defect, AI fills the punch item"
      subtitle="Type the field observation and AI structures it into a punch item; photos belong on the project photo log."
      crumbs={[{ label: "Projects", href: "/projects" }, { label: project.code, href: `/projects/${projectId}` }, { label: "Punch list", href: `/projects/${projectId}/punch-list` }, { label: "Draft" }]}
    >
      <section className="card p-6">
        <form method="get" className="grid gap-3">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Field observation</label>
          <textarea name="desc" defaultValue={desc} rows={5} placeholder="e.g. Drywall tape mud visible on south wall elevation 8-10 ft, needs touch-up and paint." className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
          <div className="flex gap-3">
            <button type="submit" className="btn-primary">Generate punch item</button>
            <Link href={`/projects/${projectId}/punch-list`} className="btn-outline text-xs">← back</Link>
          </div>
        </form>
      </section>
      {draft ? (
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Generated punch item</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Title</div><div className="text-white font-semibold">{draft.title}</div></div>
            <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Trade</div><div className="text-white font-semibold">{draft.trade}</div></div>
            <div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Criticality</div><div className="text-white font-semibold">{draft.criticality}</div></div>
          </div>
          <div className="mt-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Description</div><p className="mt-1 text-sm text-slate-200 leading-6">{draft.description}</p></div>
          <form action={`/api/projects/${projectId}/punch-list/create`} method="post" className="mt-5 flex flex-wrap items-end gap-3">
            <input type="hidden" name="title" value={draft.title} />
            <input type="hidden" name="trade" value={draft.trade} />
            <input type="hidden" name="description" value={draft.description} />
            <label className="block">
              <span className="form-label">Area (optional)</span>
              <input name="area" placeholder="e.g. South wall, Level 2" className="form-input" />
            </label>
            <label className="block">
              <span className="form-label">Due date (optional)</span>
              <input name="dueDate" type="date" className="form-input" />
            </label>
            <button className="btn-primary text-xs">Save to punch list</button>
          </form>
        </section>
      ) : null}
    </DetailShell>
  );
}
