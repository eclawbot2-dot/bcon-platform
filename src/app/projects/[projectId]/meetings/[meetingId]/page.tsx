import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildActionItemRegister } from "@/lib/meeting-actions";

/**
 * Meeting detail — minutes, attendees, and the action-item register for one
 * meeting. Editors can record minutes, add action items, and transition
 * their status. Tenant-scoped via the project.
 */
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  OPEN: "text-slate-300",
  IN_PROGRESS: "text-amber-300",
  DONE: "text-emerald-300",
  CANCELLED: "text-slate-500 line-through",
};

export default async function MeetingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; meetingId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { projectId, meetingId } = await params;
  const { ok, error } = await searchParams;
  const tenant = await requireTenant();
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, project: { id: projectId, tenantId: tenant.id } },
    include: { project: { select: { code: true, name: true } }, actionItems: { orderBy: { createdAt: "asc" } } },
  });
  if (!meeting) notFound();
  const actor = await currentActor(tenant.id);
  const canEdit = actor.canEdit;

  const { items } = buildActionItemRegister(
    meeting.actionItems.map((a) => ({
      id: a.id,
      description: a.description,
      assignee: a.assignee,
      dueDate: a.dueDate,
      status: a.status,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      meetingDate: meeting.scheduledAt,
    })),
  );

  return (
    <AppLayout
      eyebrow={`${meeting.project.code} · ${meeting.meetingType}`}
      title={meeting.title}
      description={`${formatDateTime(meeting.scheduledAt)}${meeting.location ? ` · ${meeting.location}` : ""}`}
    >
      <div className="grid gap-6">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link href={`/projects/${projectId}`} className="hover:text-cyan-200">{meeting.project.code}</Link>
          <span className="px-1.5">/</span>
          <Link href={`/projects/${projectId}/meetings`} className="hover:text-cyan-200">Meetings</Link>
          <span className="px-1.5">/</span>
          <span className="text-slate-300">{meeting.title}</span>
        </nav>

        {ok ? <div role="status" className="card border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{ok}</div> : null}
        {error ? <div role="alert" className="card border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">{error}</div> : null}

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Minutes</div>
          {meeting.attendees ? <p className="mt-3 text-sm text-slate-300"><span className="text-slate-500">Attendees: </span>{meeting.attendees}</p> : null}
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{meeting.notes || "No minutes recorded yet."}</p>
        </section>

        {canEdit ? (
          <section className="card p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Edit minutes</div>
            <form action={`/api/meetings/${meeting.id}/edit`} method="post" className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="e-title">Title</label>
                <input id="e-title" name="title" defaultValue={meeting.title} className="form-input" />
              </div>
              <div>
                <label className="form-label" htmlFor="e-loc">Location</label>
                <input id="e-loc" name="location" defaultValue={meeting.location ?? ""} className="form-input" />
              </div>
              <div className="md:col-span-2">
                <label className="form-label" htmlFor="e-att">Attendees</label>
                <input id="e-att" name="attendees" defaultValue={meeting.attendees ?? ""} className="form-input" />
              </div>
              <div className="md:col-span-2">
                <label className="form-label" htmlFor="e-notes">Minutes</label>
                <textarea id="e-notes" name="notes" rows={4} defaultValue={meeting.notes ?? ""} className="form-textarea" />
              </div>
              <div className="md:col-span-2"><button className="btn-primary">Save minutes</button></div>
            </form>
          </section>
        ) : null}

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Action items</div>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No action items captured for this meeting.</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {items.map((a) => (
                <li key={a.id} className={`py-3 ${a.overdue ? "bg-rose-500/5" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-sm ${a.status === "CANCELLED" ? "text-slate-500 line-through" : "text-white"}`}>{a.description}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {a.assignee ? <span>{a.assignee}</span> : <span className="text-slate-500">Unassigned</span>}
                        {a.dueDate ? <span className={a.overdue ? "text-rose-300" : ""}> · due {formatDate(a.dueDate)}{a.overdue ? " (overdue)" : ""}</span> : null}
                        <span className={`ml-2 ${STATUS_TONE[a.status] ?? "text-slate-400"}`}>{a.status.replace("_", " ")}</span>
                      </div>
                    </div>
                    {canEdit ? (
                      <form action={`/api/meetings/${meeting.id}/action-items/${a.id}/status`} method="post" className="flex items-center gap-2">
                        <select name="status" defaultValue={a.status} className="form-input py-1 text-xs" aria-label={`Status for ${a.description}`}>
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="DONE">Done</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                        <button className="btn-outline text-xs">Update</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <form action={`/api/meetings/${meeting.id}/action-items/create`} method="post" className="mt-5 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-[2fr_1fr_1fr_auto]">
              <div>
                <label className="form-label" htmlFor="a-desc">New action item</label>
                <input id="a-desc" name="description" required placeholder="What needs doing" className="form-input" />
              </div>
              <div>
                <label className="form-label" htmlFor="a-assignee">Assignee</label>
                <input id="a-assignee" name="assignee" placeholder="Who owes it" className="form-input" />
              </div>
              <div>
                <label className="form-label" htmlFor="a-due">Due</label>
                <input id="a-due" name="dueDate" type="date" className="form-input" />
              </div>
              <div className="flex items-end"><button className="btn-primary">Add</button></div>
            </form>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}
