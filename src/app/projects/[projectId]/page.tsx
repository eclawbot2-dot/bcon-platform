import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { SortableTable } from "@/components/SortableTable";
import { getProjectWorkspace } from "@/lib/dashboard";
import { formatCurrency, formatDate, formatDateTime, modeLabel, workflowStatusLabel } from "@/lib/utils";

function CardTitle({ title, href }: { title: string; href?: string }) {
  if (!href) return <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</div>;
  return (
    <Link href={href} className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-cyan-300 transition hover:text-cyan-200">
      <span>{title}</span>
      <span className="text-[10px]">View all →</span>
    </Link>
  );
}

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);

  if (!project) notFound();

  const STAGES = [
    { key: "PRECONSTRUCTION", label: "Preconstruction" },
    { key: "ACTIVE", label: "Active" },
    { key: "CLOSEOUT", label: "Closeout" },
    { key: "WARRANTY", label: "Warranty" },
  ] as const;
  const currentStageIdx = STAGES.findIndex((s) => s.key === project.stage);

  return (
    <AppLayout
      eyebrow="Project workspace"
      title={project.name}
      description="A single project workspace that changes required tabs, operating rituals, and execution depth by project mode."
    >
      <div className="grid gap-6">
        <ProjectTabs projectId={project.id} active="overview" mode={project.mode} />

        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Project lifecycle stage</div>
              <div className="mt-1 text-sm text-slate-400">Advancing to <strong>Closeout</strong> auto-creates closeout punch items. Advancing to <strong>Warranty</strong> opens a 1-year warranty record.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STAGES.map((s, i) => (
                <form key={s.key} action={`/api/projects/${project.id}/stage`} method="post">
                  <input type="hidden" name="stage" value={s.key} />
                  <button disabled={s.key === project.stage || i <= currentStageIdx - 1} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${s.key === project.stage ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-100" : i <= currentStageIdx - 1 ? "border-white/5 text-slate-600" : "border-white/10 text-slate-200 hover:border-cyan-500/40 hover:bg-white/5"}`}>
                    {s.key === project.stage ? `● ${s.label}` : s.label}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <div className="card p-5 lg:col-span-2">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Project identity</div>
            <div className="mt-3 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              <div><span className="text-slate-500">Mode:</span> {modeLabel(project.mode)}</div>
              <div><span className="text-slate-500">Code:</span> {project.code}</div>
              <div><span className="text-slate-500">Owner:</span> {project.ownerName}</div>
              <div><span className="text-slate-500">Contract:</span> {project.contractType}</div>
              <div><span className="text-slate-500">Address:</span> {project.address}</div>
              <div><span className="text-slate-500">Value:</span> {formatCurrency(project.contractValue)}</div>
            </div>
          </div>
          <div className="card p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Required forms</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {project.mode === "SIMPLE"
                ? ["Daily Summary", "Change Order Log", "Punch List"]
                : project.mode === "VERTICAL"
                  ? ["RFI", "Submittal", "Meeting Minutes", "Drawing Register"]
                  : ["Daily Production Report", "Ticket Reconciliation", "Pay Item Tracking"]
              .map((item) => <span key={item} className="badge-blue">{item}</span>)}
            </div>
          </div>
          <div className="card p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Tabs enabled</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {project.tabs.map((item) => <span key={item} className="badge-gray">{item}</span>)}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <div className="grid gap-6">
            <div className="card p-5">
              <CardTitle title="Job thread / engagement stream" href={`/projects/${project.id}/tasks`} />
              <div className="mt-4 space-y-3">
                {project.recentMessages.map((message) => (
                  <div key={message.id} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium text-white">{message.author}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(message.createdAt)}</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">{message.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <CardTitle title="Tasks and execution" href={`/projects/${project.id}/tasks`} />
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <SortableTable
                  columns={[
                    { header: "Task" },
                    { header: "Priority" },
                    { header: "Due" },
                  ]}
                  rows={project.upcomingTasks.map((task) => ({
                    key: task.id,
                    className: "cursor-pointer transition hover:bg-white/5",
                    cells: [
                      {
                        sort: task.title,
                        node: (
                          <Link href={`/projects/${project.id}/tasks`} className="block">
                            <div className="font-medium text-white">{task.title}</div>
                            <div className="text-xs text-slate-500">{task.status.replaceAll("_", " ")}</div>
                          </Link>
                        ),
                      },
                      { sort: task.priority, node: task.priority },
                      { sort: task.dueDate ? new Date(task.dueDate).getTime() : null, node: formatDate(task.dueDate) },
                    ],
                  }))}
                />
              </div>
            </div>

            {project.mode !== "SIMPLE" ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="card p-5">
                  <CardTitle title="RFIs" href={`/projects/${project.id}/rfis`} />
                  <div className="mt-4 space-y-3">
                    {project.rfis.map((rfi) => (
                      <Link key={rfi.id} href={`/projects/${project.id}/rfis`} className="block rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-cyan-500/30">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-white">{rfi.number}</div>
                          <span className="badge-gold">{workflowStatusLabel(rfi.status)}</span>
                        </div>
                        <div className="mt-2 text-sm text-slate-300">{rfi.subject}</div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="card p-5">
                  <CardTitle title="Submittals" href={`/projects/${project.id}/submittals`} />
                  <div className="mt-4 space-y-3">
                    {project.submittals.map((submittal) => (
                      <Link key={submittal.id} href={`/projects/${project.id}/submittals`} className="block rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-cyan-500/30">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-white">{submittal.number}</div>
                          <span className="badge-blue">{workflowStatusLabel(submittal.status)}</span>
                        </div>
                        <div className="mt-2 text-sm text-slate-300">{submittal.title}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {project.mode === "HEAVY_CIVIL" ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="card p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Installed quantities</div>
                  <div className="mt-4 space-y-3">
                    {project.quantityHighlights.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                        <div className="font-medium text-white">{item.description}</div>
                        <div className="mt-2 text-sm text-slate-300">{item.installedQty} / {item.budgetQty} {item.unit}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.locationTag}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Production records</div>
                  <div className="mt-4 space-y-3">
                    {project.productionHighlights.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                        <div className="font-medium text-white">{item.activity}</div>
                        <div className="mt-2 text-sm text-slate-300">{item.installedQty} {item.unit} · {item.productionRate}/hr</div>
                        <div className="mt-1 text-xs text-slate-500">{item.crewName} · {item.locationTag}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="grid gap-6">
            <div className="card p-5">
              <CardTitle title="Latest daily logs" href={`/projects/${project.id}/daily-logs`} />
              <div className="mt-4 space-y-3">
                {project.dailyLogs.map((log) => (
                  <Link key={log.id} href={`/projects/${project.id}/daily-logs`} className="block rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-cyan-500/30">
                    <div className="font-medium text-white">{formatDate(log.logDate)}</div>
                    <div className="mt-2 text-sm text-slate-300">{log.summary}</div>
                    <div className="mt-2 text-xs text-slate-500">Weather: {log.weather} · Manpower: {log.manpower}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <CardTitle title="Documents" href={`/projects/${project.id}/documents`} />
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {project.documents.map((document) => (
                  <Link key={document.id} href={`/projects/${project.id}/documents`} className="block rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-cyan-500/30">
                    <div className="font-medium text-white">{document.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{document.documentClass} · {document.folderPath}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <CardTitle title="Meetings / workflow runs" href="/workflows" />
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                {project.meetings.map((meeting) => (
                  <Link key={meeting.id} href="/workflows" className="block rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-cyan-500/30">
                    <div className="font-medium text-white">{meeting.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{meeting.meetingType} · {formatDateTime(meeting.scheduledAt)}</div>
                  </Link>
                ))}
                {project.workflowRuns.map((run) => (
                  <Link key={run.id} href="/workflows" className="block rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-cyan-500/30">
                    <div className="font-medium text-white">{run.templateName}</div>
                    <div className="mt-1 text-xs text-slate-500">{workflowStatusLabel(run.status)}</div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </AppLayout>
  );
}
