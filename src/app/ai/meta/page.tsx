import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { generateFixtures, releaseNotesFromCommits } from "@/lib/meta-ai";
import { isLlmEnabled } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

const DEFAULT_MODELS = ["Project", "Opportunity", "Vendor", "BidDraft", "JournalEntryRow"];

export default async function MetaAiPage() {
  const tenant = await requireTenant().catch(() => null);
  const fixtures = await generateFixtures(DEFAULT_MODELS);
  const notes = await releaseNotesFromCommits([
    { sha: "abc", subject: "Add QBO connector alongside Xero" },
    { sha: "def", subject: "Add RFP autopilot + scheduled sweep" },
    { sha: "ghi", subject: "Add 45-item AI capability suite" },
    { sha: "jkl", subject: "Upgrade deterministic heuristics — real data plumbing" },
  ]);

  const [totalRuns, byKind, recent, feedback] = tenant ? await Promise.all([
    prisma.aiRunLog.count({ where: { tenantId: tenant.id } }),
    prisma.aiRunLog.groupBy({ by: ["kind", "source"], where: { tenantId: tenant.id }, _count: { _all: true } }),
    prisma.aiRunLog.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.aiRunLog.groupBy({ by: ["userFeedback"], where: { tenantId: tenant.id, userFeedback: { not: null } }, _count: { _all: true } }),
  ]) : [0, [], [], []];

  const accepted = feedback.find((f) => f.userFeedback === "ACCEPTED")?._count._all ?? 0;
  const rejected = feedback.find((f) => f.userFeedback === "REJECTED")?._count._all ?? 0;
  const acceptRate = accepted + rejected > 0 ? ((accepted / (accepted + rejected)) * 100).toFixed(0) : "—";

  return (
    <AppLayout eyebrow="AI · Platform" title="Meta / operational AI" description="Test fixtures, release notes, LLM swap indicator, run logs, feedback.">
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Total AI runs" value={totalRuns} />
        <StatTile label="Accept rate" value={`${acceptRate}%`} tone={acceptRate === "—" ? "default" : (parseInt(acceptRate) >= 70 ? "good" : "warn")} />
        <StatTile label="LLM mode" value={isLlmEnabled() ? "Claude API" : "Heuristic"} tone={isLlmEnabled() ? "good" : "default"} />
        <StatTile label="Distinct features used" value={new Set(byKind.map((b) => b.kind)).size} />
      </section>
      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">LLM status</div>
        <div className="mt-2 text-lg font-semibold text-white">{isLlmEnabled() ? "Claude API enabled" : "Deterministic heuristics (flip ENABLE_LLM_CALLS=true + set ANTHROPIC_API_KEY)"}</div>
        <p className="mt-2 text-xs text-slate-500">All 45 AI features share one wrapper in <span className="font-mono">src/lib/ai.ts</span>. Outputs are persisted to <span className="font-mono">AiRunLog</span> and re-used within the TTL window. When the flag is off, callers get heuristic output. When on, calls route to Claude.</p>
      </section>
      {byKind.length > 0 ? (
        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Usage by feature</div>
          <SortableTable
            emptyMessage="No usage yet."
            columns={[
              { header: "Kind" },
              { header: "Source" },
              { header: "Runs" },
            ]}
            rows={byKind.sort((a, b) => (b._count?._all ?? 0) - (a._count?._all ?? 0)).map((b, i) => ({
              key: String(i),
              cells: [
                { sort: b.kind, tdClassName: "font-mono text-xs", node: b.kind },
                { sort: b.source, tdClassName: "text-xs", node: b.source },
                { sort: b._count?._all ?? 0, node: b._count?._all ?? 0 },
              ],
            }))}
          />
        </section>
      ) : null}
      {recent.length > 0 ? (
        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Recent AI runs (20)</div>
          <SortableTable
            emptyMessage="No recent runs."
            columns={[
              { header: "When" },
              { header: "Kind" },
              { header: "Entity" },
              { header: "Source" },
              { header: "Feedback" },
            ]}
            rows={recent.map((r) => ({
              key: r.id,
              cells: [
                { sort: new Date(r.createdAt).getTime(), tdClassName: "text-xs text-slate-400", node: formatDate(r.createdAt) },
                { sort: r.kind, tdClassName: "font-mono text-xs", node: r.kind },
                { sort: r.entityType ?? "", tdClassName: "text-xs", node: r.entityType ? `${r.entityType}:${r.entityId?.slice(0, 8) ?? ""}` : "—" },
                { sort: r.source, tdClassName: "text-xs", node: r.source },
                { sort: r.userFeedback ?? "", tdClassName: "text-xs", node: r.userFeedback ?? "—" },
              ],
            }))}
          />
        </section>
      ) : null}
      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Test fixtures</div>
        <pre className="mt-3 overflow-x-auto bg-slate-950 rounded-lg p-4 text-xs text-slate-200">{JSON.stringify(fixtures, null, 2)}</pre>
      </section>
      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Release notes · {notes.version}</div>
        {notes.breaking.length > 0 ? (<div className="mt-4"><div className="text-xs uppercase tracking-[0.18em] text-rose-300">Breaking</div><ul className="mt-1 text-sm text-slate-200 list-disc pl-5">{notes.breaking.map((b, i) => <li key={i}>{b}</li>)}</ul></div>) : null}
        <div className="mt-4"><div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Highlights</div><ul className="mt-1 text-sm text-slate-200 list-disc pl-5">{notes.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></div>
        {notes.bugs.length > 0 ? (<div className="mt-4"><div className="text-xs uppercase tracking-[0.18em] text-amber-300">Bug fixes</div><ul className="mt-1 text-sm text-slate-200 list-disc pl-5">{notes.bugs.map((b, i) => <li key={i}>{b}</li>)}</ul></div>) : null}
      </section>
      <Link href="/" className="btn-outline text-xs">← home</Link>
    </AppLayout>
  );
}
