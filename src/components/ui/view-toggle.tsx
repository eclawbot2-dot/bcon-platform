"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "cards" | "list";

/**
 * Card/List view preference persisted to localStorage (spec
 * drive-view-sortable-tables §1/§4). Defaults to cards; the saved value is
 * loaded in an effect so SSR markup matches the first client render.
 */
export function useViewMode(storageKey: string, defaultMode: ViewMode = "cards") {
  const [mode, setMode] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "cards" || saved === "list") setMode(saved);
    } catch {
      /* private mode — keep default */
    }
  }, [storageKey]);

  function set(next: ViewMode) {
    setMode(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* ignore */
    }
  }

  return [mode, set] as const;
}

/**
 * Google Drive-style grid/list toggle: two icon buttons with a clear active
 * state. Sits in the page toolbar next to search/add controls.
 */
export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const base = "inline-flex h-9 w-9 items-center justify-center transition";
  const active = "bg-cyan-500/20 text-cyan-200";
  const idle = "text-slate-400 hover:bg-white/10 hover:text-white";
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-white/10 bg-white/5" role="group" aria-label="View mode">
      <button
        type="button"
        title="Card view"
        aria-label="Card view"
        aria-pressed={mode === "cards"}
        onClick={() => onChange("cards")}
        className={`${base} ${mode === "cards" ? active : idle}`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        title="List view"
        aria-label="List view"
        aria-pressed={mode === "list"}
        onClick={() => onChange("list")}
        className={`${base} ${mode === "list" ? active : idle} border-l border-white/10`}
      >
        <List className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
