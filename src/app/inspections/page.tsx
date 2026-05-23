import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(tenantId: string) {
  return prisma.inspection.findMany({
    where: { project: { tenantId } },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
}

function isMunicipal(r: Row) {
  return (r.sourceSystem ?? "").startsWith("municipal:");
}

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; portal?: string; projectId?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const scope = params.scope ?? "upcoming";

  const all = await loadRows(tenant.id);
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const muni = all.filter(isMunicipal);
  const upcoming = muni.filter((r) => r.scheduledAt && new Date(r.scheduledAt).getTime() >= now - dayMs);
  const thisWeek = muni.filter((r) => {
    if (!r.scheduledAt) return false;
    const t = new Date(r.scheduledAt).getTime();
    return t >= now - dayMs && t <= now + 7 * dayMs;
  });
  const passed = muni.filter((r) => r.result === "PASS");
  const failed = muni.filter((r) => r.result === "FAIL");
  const pending = muni.filter((r) => r.result === "PENDING");

  let visible: Row[];
  if (scope === "today") {
    visible = muni.filter((r) => {
      if (!r.scheduledAt) return false;
      const d = new Date(r.scheduledAt);
      const today = new Date();
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    });
  } else if (scope === "history") {
    visible = muni.filter((r) => r.scheduledAt && new Date(r.scheduledAt).getTime() < now - dayMs);
  } else if (scope === "all") {
    visible = muni;
  } else {
    visible = upcoming;
  }
  if (params.portal) visible = visible.filter((r) => r.sourceSystem === `municipal:${params.portal}`);
  if (params.projectId) visible = visible.filter((r) => r.project.id === params.projectId);

  const columns: DataTableColumn<Row>[] = [
    {
      key: "scheduled",
      header: "When",
      render: (r) => {
        if (!r.scheduledAt) return <span className="text-slate-500">unscheduled</span>;
        const d = new Date(r.scheduledAt);
        const dateStr = d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
        const timeStr = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
        return (
          <span>
            <span className="font-semibold text-slate-200">{dateStr}</span>
            <span className="text-slate-400"> · {timeStr} ET</span>
          </span>
        );
      },
    },
    { key: "type", header: "Type", render: (r) => r.title.replace(/ — .*$/, "") },
    {
      key: "portal",
      header: "Jurisdiction",
      cellClassName: "text-slate-400 text-xs uppercase tracking-wide",
      render: (r) => (r.sourceSystem ?? "").replace(/^municipal:/, ""),
    },
    {
      key: "project",
      header: "Project",
      render: (r) => (
        <Link href={`/projects/${r.project.id}`} className="text-cyan-300 hover:underline">
          {r.project.code} · {r.project.name}
        </Link>
      ),
    },
    { key: "address", header: "Address", cellClassName: "text-slate-400 text-xs", render: (r) => r.location ?? "—" },
    { key: "inspector", header: "Inspector", cellClassName: "text-slate-400 text-xs", render: (r) => r.inspector ?? "—" },
    { key: "result", header: "Result", render: (r) => <StatusBadge status={r.result} /> },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Link href={`/inspections/${r.id}`} className="text-cyan-300 hover:underline text-xs">
          Detail →
        </Link>
      ),
    },
  ];

  const portals = Array.from(new Set(muni.map((r) => (r.sourceSystem ?? "").replace(/^municipal:/, ""))));

  return (
    <AppLayout
      eyebrow="Field · Inspections"
      title="Municipal inspections"
      description="Synced every 2 hours from Charleston-area city + county permitting portals (6am–10pm ET)."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Upcoming" value={upcoming.length} />
          <StatTile label="This week" value={thisWeek.length} tone={thisWeek.length > 0 ? "warn" : "default"} />
          <StatTile label="Passed" value={passed.length} tone="good" />
          <StatTile label="Failed" value={failed.length} tone={failed.length > 0 ? "bad" : "good"} />
          <StatTile label="Pending result" value={pending.length} />
        </section>

        <section className="flex flex-wrap items-center gap-2 px-1 text-xs uppercase tracking-[0.16em] text-slate-400">
          <span>Scope:</span>
          {[
            ["upcoming", "Upcoming"],
            ["today", "Today"],
            ["history", "History"],
            ["all", "All"],
          ].map(([k, label]) => (
            <Link
              key={k}
              href={`/inspections?scope=${k}`}
              className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.18em] ${scope === k ? "border-cyan-400/60 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
            >
              {label}
            </Link>
          ))}
          {portals.length > 0 ? (
            <>
              <span className="ml-4">Portal:</span>
              <Link
                href={`/inspections?scope=${scope}`}
                className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.18em] ${!params.portal ? "border-cyan-400/60 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
              >
                All
              </Link>
              {portals.map((p) => (
                <Link
                  key={p}
                  href={`/inspections?scope=${scope}&portal=${p}`}
                  className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.18em] ${params.portal === p ? "border-cyan-400/60 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
                >
                  {p}
                </Link>
              ))}
            </>
          ) : null}
          <span className="ml-auto flex gap-2">
            <Link href="/inspections/calendar" className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              Calendar view
            </Link>
            <Link href="/inspections/runs" className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              Sync history
            </Link>
            <Link href="/settings/jurisdictions" className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              Portal credentials
            </Link>
            <form action="/api/inspections/sync-now" method="post">
              <button type="submit" className="rounded-full border border-cyan-500/60 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-500/10">
                Sync now
              </button>
            </form>
          </span>
        </section>

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(r) => r.id}
          emptyMessage="No municipal inspections in this scope yet — try Sync now."
        />
      </div>
    </AppLayout>
  );
}
