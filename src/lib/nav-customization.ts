/**
 * Per-user sidebar personalization: reorder + hide of nav groups and
 * items. Persisted entirely in the browser under localStorage key
 * `bcon:nav:customization` (NO database) — so it is per-user-per-browser
 * and never leaves the device. The Sidebar renders the DEFAULT order on
 * SSR and first client render, then applies the saved prefs after mount
 * (see SidebarNav's `ready` flag) so there is no hydration mismatch.
 *
 * Node ids are stable + globally unique:
 *   group → the group title                  (parentKey ROOT_KEY)
 *   item  → `${groupTitle}::${href}`         (parentKey groupTitle)
 *
 * bcon's sidebar is flat (groups → items), so there are no subgroups; the
 * id/parentKey scheme still mirrors gcon's so the two stay consistent.
 */

export const ROOT_KEY = "__root__";
export const STORAGE_KEY = "bcon:nav:customization";

export type NavCustomization = {
  /** parentKey → ordered child ids (only parents the user reordered). */
  order: Record<string, string[]>;
  /** hidden node ids (groups / items). */
  hidden: string[];
};

export function emptyNavCustomization(): NavCustomization {
  return { order: {}, hidden: [] };
}

export function itemIdOf(groupTitle: string, href: string): string {
  return `${groupTitle}::${href}`;
}

/** Defensive parse of an arbitrary value into a NavCustomization. */
export function navCustomizationFrom(raw: unknown): NavCustomization {
  if (!raw || typeof raw !== "object") return emptyNavCustomization();
  const nav = raw as Partial<NavCustomization>;
  const order: Record<string, string[]> = {};
  if (nav.order && typeof nav.order === "object") {
    for (const [k, v] of Object.entries(nav.order as Record<string, unknown>)) {
      if (Array.isArray(v)) order[k] = v.filter((x): x is string => typeof x === "string");
    }
  }
  const hidden = Array.isArray(nav.hidden) ? nav.hidden.filter((x): x is string => typeof x === "string") : [];
  return { order, hidden };
}

/** Read the saved customization from localStorage (SSR-safe; never throws). */
export function readNavCustomization(): NavCustomization {
  if (typeof window === "undefined") return emptyNavCustomization();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyNavCustomization();
    return navCustomizationFrom(JSON.parse(raw));
  } catch {
    return emptyNavCustomization();
  }
}

/** Persist the customization to localStorage (SSR-safe; never throws). */
export function writeNavCustomization(c: NavCustomization): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* quota / disabled storage — best effort, ignore */
  }
}

/**
 * Stable reorder: nodes whose id is in `savedOrder` come first, in saved
 * order; everything else keeps its default relative order, appended.
 * Tolerates ids that were added/removed since the order was saved.
 */
export function applyOrder<T>(nodes: T[], idOf: (t: T) => string, savedOrder?: string[]): T[] {
  if (!savedOrder || savedOrder.length === 0) return nodes;
  const pos = new Map(savedOrder.map((id, i) => [id, i] as const));
  return nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const pa = pos.has(idOf(a.n)) ? pos.get(idOf(a.n))! : Number.MAX_SAFE_INTEGER;
      const pb = pos.has(idOf(b.n)) ? pos.get(idOf(b.n))! : Number.MAX_SAFE_INTEGER;
      return pa !== pb ? pa - pb : a.i - b.i;
    })
    .map((x) => x.n);
}

export function isHidden(c: NavCustomization, id: string): boolean {
  return c.hidden.includes(id);
}
