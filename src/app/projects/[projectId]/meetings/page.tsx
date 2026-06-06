import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildActionItemRegister } from "@/lib/meeting-actions";

/**
 * Project meetings + minutes index. Lists every meeting (newest first) and
 * rolls all action items into one open/overdue register so commitments
 * don't get lost between meetings. Tenant-scoped via the project.
 */
export const dynamic = "force-dynamic";

const MEETING_TYPES = ["PROGRESS", "OAC", "COORDINATION", "SAFETY", "PRECON", "KICKOFF", "CLOSEOUT", "OTHER"];

export default async function MeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { projectId } = await params;
  const { ok, error } = await searchParams;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: tenant.id },
    include: {
      meetings: {
        orderBy: { scheduledAt: "desc" },
        include: { actionItems: true },
      },
    },
  });
  if (!project) notFound();

  const now = new Date();
  const allItems = project.meetings.flatMap((m) =>
    m.actionItems.map((a) => ({
      id: a.id,
      description: a.description,
      assignee: a.assignee,
      dueDate: a.dueDate,
      status: a.status,
      meetingId: m.id,
      meetingTitle: m.title,
      meetingDate: m.scheduledAt,
    })),
  );
  const { items: register, summary } = buildActionItemRegister(allItems, now);
  const openRegister = register.filter((r) => r.open);

  const today = new Date().toISOString().slice(0, 16);

  return (
    <AppLayout
      eyebrow={`${project.code} · Meetings`}
      title={project.name}
      description="Meeting minutes and action items — who owes what, by when. Open and overdue items roll up across every meeting."
    >
      <div className="grid gap-6">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link href={`/projects/${projectId}`} className="hover:text-cyan-200">{project.code}</Link>
          <span className="px-1.5">/</span>
          <span className="text-slate-300">Meetings</span>
        </nav>

        {ok ? <div role="status" className="card border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{ok}</div> : null}
        {error ? <div role="alert" className="card border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">{error}</div> : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Tile label="Meetings" value={project.meetings.length} />
          <Tile label="Open action items" value={summary.open} />
          <Tile label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? "bad" : "default"} />
          <Tile label="Completed" value={summary.done} tone="good" />
        </section>

        <section className="card p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Log a meeting</div>
          <form action={`/api/projects/${projectId}/meetings/create`} method="post" className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="m-title">Title</label>
              <input id="m-title" name="title" required placeholder="e.g. Weekly OAC #14" className="form-input" />
            </div>
            <div>
              <label className="form-label" htmlFor="m-type">Type</label>
              <select id="m-type" name="meetingType" className="form-input" defaultValue="PROGRESS">
                {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="m-date">Date / time</label>
              <input id="m-date" name="scheduledAt" type="datetime-local" defaultValue={today} className="form-input" />
            </div>
            <div>
              <label className="form-label" htmlFor="m-loc">Location</label>
              <input id="m-loc" name="location" placeholder="Job trailer / Teams" className="form-input" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label" htmlFor="m-att">Attendees</label>
              <input id="m-att" name="attendees" placeholder="Names / companies present" className="form-input" />
            </div>
            <div className="md:col-span-2">
              <label className="form-label" htmlFor="m-notes">Minutes (optional)</label>
              <textarea id="m-notes" name="notes" rows={2} placeholder="Discussion summary" className="form-textarea" />
            </div>
            <div className="md:col-span-2"><button className="btn-primary">Create meeting</button></div>
          </form>
        </section>

        {openRegister.length > 0 ? (
          <section className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Open action items</div>
            <p className="mt-1 text-xs text-slate-400">Overdue first, then soonest due. Across all meetings.</p>
            <SortableTable
              className="mt-4 min-w-full divide-y divide-white/10 text-sm"
              emptyMessage="No open action items."
              columns={[
                { header: "Action", thClassName: "py-2 pr-4" },
                { header: "Assignee", thClassName: "py-2 pr-4" },
                { header: "Due", align: "right", thClassName: "py-2 pr-4" },
                { header: "Status", thClassName: "py-2 pr-4" },
                { header: "Meeting", thClassName: "py-2 pr-4" },
              ]}
              rows={openRegister.map((r) => ({
                key: r.id,
                className: r.overdue ? "bg-rose-500/5" : undefined,
                cells: [
                  { sort: r.description, node: r.description, tdClassName: "py-2 pr-4 text-white max-w-md" },
                  { sort: r.assignee ?? "", node: r.assignee ?? "—", tdClassName: "py-2 pr-4 text-slate-300" },
                  {
                    sort: r.dueDate ? r.dueDate.getTime() : Number.POSITIVE_INFINITY,
                    node: r.dueDate ? <span className={r.overdue ? "text-rose-300" : "text-slate-300"}>{formatDate(r.dueDate)}{r.overdue ? " · overdue" : ""}</span> : "—",
                    tdClassName: "py-2 pr-4 text-right",
                  },
                  { sort: r.status, node: r.status.replace("_", " "), tdClassName: "py-2 pr-4 text-slate-400 text-xs" },
                  { sort: r.meetingTitle, node: <Link href={`/projects/${projectId}/meetings/${r.meetingId}`} className="text-cyan-200 hover:underline">{r.meetingTitle}</Link>, tdClassName: "py-2 pr-4" },
                ],
              }))}
            />
          </section>
        ) : null}

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Meetings</div>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No meetings logged yet."
            columns={[
              { header: "Title", thClassName: "py-2 pr-4" },
              { header: "Type", thClassName: "py-2 pr-4" },
              { header: "Date", thClassName: "py-2 pr-4" },
              { header: "Action items", align: "right", thClassName: "py-2 pr-4" },
            ]}
            rows={project.meetings.map((m) => {
              const open = m.actionItems.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS").length;
              return {
                key: m.id,
                cells: [
                  { sort: m.title, node: <Link href={`/projects/${projectId}/meetings/${m.id}`} className="text-cyan-200 hover:underline">{m.title}</Link>, tdClassName: "py-2 pr-4 font-medium" },
                  { sort: m.meetingType, node: m.meetingType, tdClassName: "py-2 pr-4 text-slate-400 text-xs" },
                  { sort: m.scheduledAt.getTime(), node: formatDateTime(m.scheduledAt), tdClassName: "py-2 pr-4 text-slate-300" },
                  { sort: open, node: `${open} open / ${m.actionItems.length}`, tdClassName: "py-2 pr-4 text-right text-slate-300" },
                ],
              };
            })}
          />
        </section>
      </div>
    </AppLayout>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" | "default" }) {
  const color = tone === "bad" ? "text-rose-300" : tone === "good" ? "text-emerald-300" : "text-white";
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
