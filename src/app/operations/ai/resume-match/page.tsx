import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { resumeRoleMatch } from "@/lib/ops-ai";

export default async function ResumeMatchPage({ searchParams }: { searchParams: Promise<{ resume?: string }> }) {
  const sp = await searchParams;
  const text = sp.resume ?? "";
  const match = text ? await resumeRoleMatch(text) : null;

  return (
    <AppLayout eyebrow="Ops AI" title="Resume → Role matcher" description="AI extracts skills, certs, experience and scores against open roles.">
      <form method="get" className="card p-6 grid gap-3">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Paste resume text</label>
        <textarea name="resume" defaultValue={text} rows={10} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <div className="flex gap-3">
          <button type="submit" className="btn-primary">Analyze</button>
          <Link href="/operations/ai" className="btn-outline text-xs">← back</Link>
        </div>
      </form>
      {match ? (
        <>
          <section className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Summary</div>
            <p className="mt-2 text-sm text-slate-200 leading-6">{match.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {match.skills.map((s) => <span key={s} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs text-emerald-200">{s}</span>)}
              {match.certifications.map((s) => <span key={s} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-0.5 text-xs text-cyan-200">{s}</span>)}
            </div>
          </section>
          <section className="card p-0 overflow-hidden">
            <SortableTable
              emptyMessage="No role matches."
              columns={[
                { header: "Role" },
                { header: "Score" },
                { header: "Missing" },
              ]}
              rows={match.roleMatches.map((r) => ({
                key: r.role,
                cells: [
                  { sort: r.role, node: r.role },
                  { sort: r.score, node: `${r.score}%`, tdClassName: "font-semibold text-white" },
                  { sort: r.missing.join("; "), node: r.missing.length > 0 ? r.missing.join("; ") : "—", tdClassName: "text-xs text-slate-400" },
                ],
              }))}
            />
          </section>
        </>
      ) : null}
    </AppLayout>
  );
}
