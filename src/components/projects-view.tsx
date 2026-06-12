"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { SortableTable } from "@/components/SortableTable";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { formatCurrency, formatPercent, modeLabel, modeColor, modeShort } from "@/lib/utils";

/** Serializable slice of a project workspace card (Decimal fields pre-converted server-side). */
export type ProjectListItem = {
  id: string;
  name: string;
  code: string;
  mode: string;
  contractType: string | null;
  address: string | null;
  ownerName: string | null;
  contractValue: number;
  progressPct: number;
  tabs: string[];
  upcomingTasks: { id: string; title: string; priority: string; status: string }[];
  channels: { channel: string }[];
  latestSummary: string;
};

/**
 * Projects registry with a Drive-style Card/List toggle (spec
 * drive-view-sortable-tables §1-§5). One shared filtered data source feeds
 * both views; the selected view and the list sort persist in localStorage
 * (`projectsViewMode`, `projectsSort`).
 */
export function ProjectsView({ projects }: { projects: ProjectListItem[] }) {
  const [viewMode, setViewMode] = useViewMode("projectsViewMode");
  const [query, setQuery] = useState("");

  // Filter once, render either view from the same result (spec §5/§8).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.name, p.code, p.ownerName, p.address, p.contractType, modeLabel(p.mode)].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [projects, query]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm" style={{ color: "var(--faint)" }}>
          {filtered.length} project{filtered.length === 1 ? "" : "s"}
          {query ? ` matching “${query}”` : " in this tenant"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative" aria-label="Search projects">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="form-input h-9 w-48 pl-9 text-sm sm:w-64"
            />
          </label>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Link href="/projects/create" className="btn-primary">+ New project</Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: "var(--faint)" }}>
            {projects.length === 0 ? "No projects yet." : "No projects match your search."}
          </p>
          {projects.length === 0 ? (
            <Link href="/projects/create" className="btn-primary mt-4 inline-block">Create your first project</Link>
          ) : null}
        </div>
      ) : null}

      {viewMode === "list" ? (
        filtered.length > 0 ? (
          <section className="card p-0 overflow-hidden">
            <SortableTable
              storageKey="projectsSort"
              theadClassName="bg-white/5"
              emptyMessage="No projects match your search."
              columns={[
                { header: "Project" },
                { header: "Owner" },
                { header: "Contract type" },
                { header: "Contract value", align: "right" },
                { header: "Progress", align: "right" },
                { header: "Open tasks", align: "right" },
              ]}
              rows={filtered.map((p) => ({
                key: p.id,
                href: `/projects/${p.id}`,
                className: "h-14 transition hover:bg-white/5",
                cells: [
                  {
                    sort: p.name,
                    node: (
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[10px] font-semibold uppercase tracking-wide ${modeColor(p.mode, "border")} ${modeColor(p.mode, "bg")} ${modeColor(p.mode, "text")}`}
                          title={modeLabel(p.mode)}
                        >
                          {modeShort(p.mode)}
                        </span>
                        <span className="min-w-0">
                          <Link href={`/projects/${p.id}`} className="block truncate font-medium text-white hover:text-cyan-200">
                            {p.name}
                          </Link>
                          <span className="block truncate text-xs text-slate-500">{p.code} · {p.address}</span>
                        </span>
                      </div>
                    ),
                  },
                  { sort: p.ownerName ?? "", node: p.ownerName ?? "—", tdClassName: "text-slate-400" },
                  { sort: p.contractType ?? "", node: p.contractType ?? "—", tdClassName: "text-slate-400" },
                  { sort: p.contractValue, node: formatCurrency(p.contractValue), tdClassName: "font-medium text-white" },
                  { sort: p.progressPct, node: formatPercent(p.progressPct) },
                  { sort: p.upcomingTasks.length, node: p.upcomingTasks.length, tdClassName: "text-slate-400" },
                ],
              }))}
            />
          </section>
        ) : null
      ) : (
        filtered.map((project) => (
          <section key={project.id} className="card p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${modeColor(project.mode, "border")} ${modeColor(project.mode, "bg")} ${modeColor(project.mode, "text")}`}>
                  <span>{modeShort(project.mode)}</span>
                  <span className="opacity-70">{modeLabel(project.mode)}</span>
                </div>
                <h2 className="mt-2 min-w-0 break-words text-2xl font-semibold text-white">{project.name}</h2>
                <div className="mt-2 text-sm text-slate-400">{project.code} · {project.contractType} · {project.address}</div>
                <div className="mt-2 text-sm text-slate-400">Owner: {project.ownerName}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:min-w-[280px]">
                <div className="panel p-4 min-w-0 overflow-hidden">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Contract value</div>
                  <div className="mt-2 min-w-0 truncate text-xl font-semibold tabular-nums text-white" title={formatCurrency(project.contractValue)}>{formatCurrency(project.contractValue)}</div>
                </div>
                <div className="panel p-4 min-w-0 overflow-hidden">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Progress</div>
                  <div className="mt-2 min-w-0 truncate text-xl font-semibold tabular-nums text-white" title={formatPercent(project.progressPct)}>{formatPercent(project.progressPct)}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {project.tabs.map((tab) => (
                <span key={tab} className="badge-blue">{tab}</span>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="panel p-4 min-w-0 overflow-hidden">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Upcoming tasks</div>
                <div className="mt-3 space-y-3">
                  {project.upcomingTasks.map((task) => (
                    <Link key={task.id} href={`/projects/${project.id}/tasks`} className="block rounded-xl border border-white/5 bg-white/5 p-3 transition hover:border-cyan-500/40 hover:bg-white/10">
                      <div className="font-medium text-white">{task.title}</div>
                      <div className="mt-1 text-xs text-slate-400">{task.priority} · {task.status.replaceAll("_", " ")}</div>
                    </Link>
                  ))}
                  {project.upcomingTasks.length === 0 ? <div className="text-xs text-slate-500">No upcoming tasks.</div> : null}
                </div>
              </div>
              <div className="panel p-4 min-w-0 overflow-hidden">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Workflow channels</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {project.channels.map((channel) => (
                    <span key={`${project.id}-${channel.channel}`} className="badge-gray">{channel.channel}</span>
                  ))}
                </div>
                <div className="mt-4 text-sm leading-6 text-slate-300">{project.latestSummary}</div>
              </div>
              <div className="panel p-4 min-w-0 overflow-hidden">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Workspace link</div>
                <div className="mt-3 text-sm text-slate-300">Open the full project workspace with mode-specific tabs and engagement surfaces.</div>
                <Link href={`/projects/${project.id}`} className="btn-primary mt-4">Open workspace</Link>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
