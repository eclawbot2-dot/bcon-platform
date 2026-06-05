import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { analyzeSurvey } from "@/lib/client-ai";

export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ responses?: string }> }) {
  const sp = await searchParams;
  const text = sp.responses ?? "";
  const responses = text ? text.split("---").map((s) => s.trim()).filter(Boolean) : [];
  const result = responses.length > 0 ? await analyzeSurvey(responses) : null;

  return (
    <AppLayout eyebrow="AI · Client feedback" title="Post-project survey analyzer" description="Paste survey responses (one per block, separated by ---). AI extracts themes, sentiment, NPS drivers.">
      <form method="get" className="card p-6 grid gap-3">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Survey responses (separate by ---)</label>
        <textarea name="responses" defaultValue={text} rows={10} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <div className="flex gap-3">
          <button className="btn-primary">Analyze</button>
          <Link href="/" className="btn-outline text-xs">← home</Link>
        </div>
      </form>
      {result ? (
        <>
          <section className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">NPS score</div>
            <div className="mt-2 text-3xl font-semibold text-white">{result.npsScore}</div>
          </section>
          {result.themes.map((t, i) => (
            <section key={i} className="card p-6">
              <div className="flex items-center gap-3">
                <span className={"inline-flex rounded-full border px-3 py-0.5 text-xs uppercase tracking-[0.18em] " + (t.sentiment === "POS" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : t.sentiment === "NEG" ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200")}>{t.sentiment}</span>
                <div className="text-lg font-semibold text-white">{t.theme}</div>
              </div>
              {t.quoteExcerpt ? <p className="mt-3 text-sm text-slate-400 italic">&ldquo;{t.quoteExcerpt}…&rdquo;</p> : null}
            </section>
          ))}
          <section className="card p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">Recommendations</div>
            <ul className="mt-3 space-y-1 text-sm text-slate-200 list-disc pl-5">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </section>
        </>
      ) : null}
    </AppLayout>
  );
}
