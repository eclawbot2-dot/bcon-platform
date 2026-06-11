/**
 * Shared client-side sorting primitives (spec: drive-view-sortable-tables §6-§10).
 *
 * Extracted from SortableTable so the comparison rules are unit-testable and
 * reusable by any view (tables, list views) without dragging React in.
 *
 * Rules:
 * - Dates sort by epoch millis (real date values, never display strings).
 * - Numbers sort numerically (high-low / low-high).
 * - Booleans sort false → true ascending.
 * - Strings sort with `localeCompare(..., { numeric: true })`, so "Item 9"
 *   correctly precedes "Item 10" and "$1,200"-style numeric-ish strings
 *   behave sanely if a caller forgets to pass the raw number.
 * - Empty values (null / undefined / "") always sort to the bottom in either
 *   direction — a Drive-ism that keeps blanks out of the way.
 */

export type SortValue = string | number | boolean | Date | null | undefined;

export type SortDirection = "asc" | "desc";

export function isEmptySortValue(v: SortValue): boolean {
  return v === null || v === undefined || v === "";
}

export function compareSortValues(a: SortValue, b: SortValue): number {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Returns a NEW sorted array (never mutates the input — spec §8) ordered by
 * the sort value `pick` extracts from each row. Empty values land at the
 * bottom regardless of direction.
 */
export function sortRows<T>(rows: readonly T[], pick: (row: T) => SortValue, dir: SortDirection): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((ra, rb) => {
    const a = pick(ra);
    const b = pick(rb);
    const ae = isEmptySortValue(a);
    const be = isEmptySortValue(b);
    if (ae && be) return 0;
    if (ae) return 1;
    if (be) return -1;
    return factor * compareSortValues(a, b);
  });
}
