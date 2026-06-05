/**
 * Project-scoped loading skeleton — mirrors the project sub-page layout
 * (tab strip + stat tiles + a table/cards block) so the transition between
 * project tabs feels instant instead of freezing the previous view.
 */
export default function ProjectLoading() {
  return (
    <div className="grid gap-6 p-4 animate-pulse lg:p-6" aria-busy="true" aria-live="polite">
      <div className="h-12 rounded-2xl bg-white/[0.04]" />
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-white/[0.04]" />
      <span className="sr-only">Loading project…</span>
    </div>
  );
}
