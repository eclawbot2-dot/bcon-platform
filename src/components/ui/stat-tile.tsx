import Link from "next/link";

type Tone = "good" | "warn" | "bad" | "default";

/**
 * Overflow hardening (owner mandate, propagated cross-platform): long
 * values like "$38,500,000" must NEVER bleed into a neighboring tile.
 * min-w-0 + overflow-hidden on the root keep the tile from inflating its
 * grid track; the value is tabular-nums and truncates (full value stays
 * available via title). Labels/subs wrap instead of overflowing.
 */
export function StatTile({ label, value, sub, tone = "default", href }: { label: string; value: string | number; sub?: string; tone?: Tone; href?: string }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-white";
  const inner = (
    <div className={`panel min-w-0 overflow-hidden p-4 ${href ? "transition hover:border-cyan-500/40 hover:shadow-lg cursor-pointer" : ""}`}>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400 break-words">{label}</div>
      <div className={`mt-2 min-w-0 truncate text-2xl font-semibold tabular-nums ${toneClass}`} title={String(value)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500 break-words">{sub}</div> : null}
      {href ? <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300">View →</div> : null}
    </div>
  );
  return href ? <Link href={href} className="block min-w-0">{inner}</Link> : inner;
}
