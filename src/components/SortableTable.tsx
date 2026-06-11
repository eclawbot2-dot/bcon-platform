"use client";

import { ReactNode, useMemo, useState } from "react";

export type SortValue = string | number | boolean | Date | null | undefined;

export type SortColumn = {
  /** Header content. */
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** Set false to disable sorting on this column (e.g. action columns). Default true. */
  sortable?: boolean;
  /** Extra classes for the <th>. The base `.table-header` is always applied. */
  thClassName?: string;
};

export type SortCell = {
  /** Primitive used to sort this column. Omit/null sorts to the bottom. */
  sort?: SortValue;
  /** Rendered cell content. */
  node: ReactNode;
  /** Extra classes for the <td>. The base `.table-cell` is always applied. */
  tdClassName?: string;
};

export type SortRow = {
  key: string;
  className?: string;
  cells: SortCell[];
};

type SortState = { index: number; dir: "asc" | "desc" } | null;

function isEmpty(v: SortValue): boolean {
  return v === null || v === undefined || v === "";
}

function compare(a: SortValue, b: SortValue): number {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "";

/**
 * Drop-in replacement for the project's standard data table. Clicking a column
 * header sorts the rows in the browser (asc → desc → unsorted). Each row supplies
 * a `sort` primitive plus the rendered `node` per cell, so computed/formatted
 * columns (money, dates, nested values) sort correctly.
 *
 * Renders `<table className="min-w-full divide-y divide-white/10 text-sm">` with
 * `.table-header` / `.table-cell` styling — matching the existing convention.
 * Override the root class via `className` if a specific table needs different
 * widths (e.g. `mt-4 min-w-full divide-y divide-white/10 text-sm`).
 */
export function SortableTable({
  columns,
  rows,
  initialSort,
  emptyMessage = "No records yet.",
  className = "min-w-full divide-y divide-white/10 text-sm",
}: {
  columns: SortColumn[];
  rows: SortRow[];
  initialSort?: { index: number; dir: "asc" | "desc" };
  emptyMessage?: ReactNode;
  className?: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { index, dir } = sort;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a.cells[index]?.sort;
      const bv = b.cells[index]?.sort;
      const ae = isEmpty(av);
      const be = isEmpty(bv);
      if (ae && be) return 0;
      if (ae) return 1;
      if (be) return -1;
      return factor * compare(av, bv);
    });
  }, [rows, sort]);

  function toggle(index: number) {
    setSort((prev) => {
      if (!prev || prev.index !== index) return { index, dir: "asc" };
      if (prev.dir === "asc") return { index, dir: "desc" };
      return null;
    });
  }

  return (
    // Self-contained horizontal scroll: wide tables (pay apps, COs,
    // estimates) pan sideways on phones instead of overflowing the
    // 390px viewport. Pages that already wrap in .overflow-x-auto
    // simply get a no-op nested container.
    <div className="overflow-x-auto">
    <table className={className}>
      <thead>
        <tr>
          {columns.map((col, i) => {
            const sortable = col.sortable !== false;
            const active = sort?.index === i;
            return (
              <th key={i} className={`table-header ${alignClass(col.align)} ${col.thClassName ?? ""}`}>
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`group inline-flex items-center gap-1 uppercase tracking-[inherit] hover:opacity-80 ${
                      col.align === "right" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <span>{col.header}</span>
                    <span className="text-[9px] leading-none">
                      {active ? (sort!.dir === "asc" ? "▲" : "▼") : <span className="opacity-0 group-hover:opacity-50">▲</span>}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10">
        {sorted.length === 0 && (
          <tr>
            <td className="table-cell text-center opacity-60" colSpan={columns.length}>
              {emptyMessage}
            </td>
          </tr>
        )}
        {sorted.map((row) => (
          <tr key={row.key} className={row.className}>
            {row.cells.map((cell, i) => (
              <td key={i} className={`table-cell ${alignClass(columns[i]?.align)} ${cell.tdClassName ?? ""}`}>
                {cell.node}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
