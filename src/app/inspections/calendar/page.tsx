import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

type View = "week" | "month";

async function loadRows(tenantId: string, from: Date, to: Date) {
  return prisma.inspection.findMany({
    where: {
      project: { tenantId },
      scheduledAt: { gte: from, lte: to },
      sourceSystem: { startsWith: "municipal:" },
    },
    include: { project: { select: { id: true, name: true, code: true } } },
    orderBy: { scheduledAt: "asc" },
  });
}

function startOfWeekEt(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}

export default async function InspectionCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; anchor?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const view: View = params.view === "month" ? "month" : "week";

  const anchor = params.anchor ? new Date(params.anchor) : new Date();
  const start = view === "week" ? startOfWeekEt(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(start);
  end.setDate(end.getDate() + (view === "week" ? 7 : 42));

  const inspections = await loadRows(tenant.id, start, end);

  // Bucket by yyyy-mm-dd in ET to avoid TZ drift on day boundaries.
  const byDay = new Map<string, typeof inspections>();
  for (const i of inspections) {
    if (!i.scheduledAt) continue;
    const d = new Date(i.scheduledAt);
    const key = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(i);
  }

  const days: { key: string; dateLabel: string; rows: typeof inspections }[] = [];
  const numDays = view === "week" ? 7 : 42;
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    days.push({ key, dateLabel: fmtDay(d), rows: byDay.get(key) ?? [] });
  }

  const prevAnchor = new Date(start);
  prevAnchor.setDate(prevAnchor.getDate() - (view === "week" ? 7 : 30));
  const nextAnchor = new Date(start);
  nextAnchor.setDate(nextAnchor.getDate() + (view === "week" ? 7 : 30));

  return (
    <AppLayout
      eyebrow="Field · Inspections"
      title={view === "week" ? "Inspections this week" : "Inspections this month"}
      description="Calendar of every scheduled inspection across all Charleston-area portals. All times in America/New_York."
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs uppercase tracking-[0.16em] text-slate-400">
          <span className="flex gap-2">
            <Link
              href={`/inspections/calendar?view=week`}
              className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.18em] ${view === "week" ? "border-cyan-400/60 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
            >
              Week
            </Link>
            <Link
              href={`/inspections/calendar?view=month`}
              className={`rounded-full border px-3 py-1 text-[10px] tracking-[0.18em] ${view === "month" ? "border-cyan-400/60 text-cyan-200" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}
            >
              Month
            </Link>
          </span>
          <span className="flex gap-2">
            <Link href={`/inspections/calendar?view=${view}&anchor=${prevAnchor.toISOString()}`} className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              ← Prev
            </Link>
            <Link href={`/inspections/calendar?view=${view}`} className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              Today
            </Link>
            <Link href={`/inspections/calendar?view=${view}&anchor=${nextAnchor.toISOString()}`} className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              Next →
            </Link>
            <Link href="/inspections" className="rounded-full border border-slate-700 px-3 py-1 text-[10px] tracking-[0.18em] text-slate-300 hover:text-slate-100">
              List view
            </Link>
          </span>
        </div>

        <div className={view === "week" ? "grid gap-3 md:grid-cols-7" : "grid gap-3 md:grid-cols-7"}>
          {days.map((day) => (
            <div key={day.key} className="panel p-3 min-h-[140px]">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">{day.dateLabel}</div>
              {day.rows.length === 0 ? (
                <div className="text-xs text-slate-600 italic">—</div>
              ) : (
                <ul className="space-y-2">
                  {day.rows.map((r) => (
                    <li key={r.id} className="text-xs">
                      <Link href={`/inspections/${r.id}`} className="block rounded border border-slate-700 px-2 py-1 hover:border-cyan-500/60">
                        <div className="font-semibold text-slate-200">{fmtTime(new Date(r.scheduledAt!))} ET</div>
                        <div className="text-slate-300 truncate">{r.title.replace(/ — .*$/, "")}</div>
                        <div className="text-[10px] text-slate-500 truncate">{r.project.code} · {(r.sourceSystem ?? "").replace(/^municipal:/, "")}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
