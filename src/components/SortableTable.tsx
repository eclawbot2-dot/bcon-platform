"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sortRows, type SortDirection, type SortValue } from "@/lib/sort";

export type { SortValue } from "@/lib/sort";

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
  /** When set, clicking anywhere on the row (outside links/buttons/inputs)
   *  navigates here — gives Drive-style list rows the same click target as
   *  the card they replace. */
  href?: string;
  /** "_blank" opens href in a new tab (e.g. full-size photos). */
  hrefTarget?: "_blank";
  cells: SortCell[];
};

type SortState = { index: number; dir: SortDirection } | null;

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "";

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("a,button,input,select,textarea,label,form"));
}

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
 *
 * `storageKey` persists the active sort to localStorage (spec §9) — loaded in
 * an effect (not the initial render) so SSR markup matches the first client
 * render and hydration stays clean.
 *
 * `footerRows` render in a <tfoot> below the data and are excluded from
 * sorting — totals/subtotal rows stay pinned at the bottom (estimate totals,
 * CO markup, G703 totals).
 */
export function SortableTable({
  columns,
  rows,
  footerRows,
  initialSort,
  storageKey,
  emptyMessage = "No records yet.",
  className = "min-w-full divide-y divide-white/10 text-sm",
  theadClassName = "",
}: {
  columns: SortColumn[];
  rows: SortRow[];
  /** Pinned, unsorted rows rendered in <tfoot> (totals/summary rows). */
  footerRows?: SortRow[];
  initialSort?: { index: number; dir: SortDirection };
  /** localStorage key to persist sort state across visits (spec §9). */
  storageKey?: string;
  emptyMessage?: ReactNode;
  className?: string;
  theadClassName?: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  // Only persist after we've attempted to load — otherwise the very first
  // render would clobber the saved preference with the default.
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { index?: unknown; dir?: unknown } | null;
        if (
          parsed &&
          typeof parsed.index === "number" &&
          parsed.index >= 0 &&
          parsed.index < columns.length &&
          (parsed.dir === "asc" || parsed.dir === "desc") &&
          columns[parsed.index]?.sortable !== false
        ) {
          setSort({ index: parsed.index, dir: parsed.dir });
        }
      }
    } catch {
      /* private mode / corrupt value — keep default */
    }
    setStorageLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !storageLoaded) return;
    try {
      if (sort) window.localStorage.setItem(storageKey, JSON.stringify(sort));
      else window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore quota/private-mode failures */
    }
  }, [sort, storageKey, storageLoaded]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return sortRows(rows, (row) => row.cells[sort.index]?.sort, sort.dir);
  }, [rows, sort]);

  function toggle(index: number) {
    setSort((prev) => {
      if (!prev || prev.index !== index) return { index, dir: "asc" };
      if (prev.dir === "asc") return { index, dir: "desc" };
      return null;
    });
  }

  function renderRow(row: SortRow) {
    const clickable = Boolean(row.href);
    return (
      <tr
        key={row.key}
        className={`${row.className ?? ""} ${clickable ? "cursor-pointer" : ""}`.trim() || undefined}
        onClick={
          clickable
            ? (e) => {
                if (isInteractive(e.target)) return; // let inline links/forms win
                if (row.hrefTarget === "_blank") window.open(row.href!, "_blank", "noopener");
                else router.push(row.href!);
              }
            : undefined
        }
      >
        {row.cells.map((cell, i) => (
          <td key={i} className={`table-cell ${alignClass(columns[i]?.align)} ${cell.tdClassName ?? ""}`}>
            {cell.node}
          </td>
        ))}
      </tr>
    );
  }

  return (
    // Self-contained horizontal scroll: wide tables (pay apps, COs,
    // estimates) pan sideways on phones instead of overflowing the
    // 390px viewport. Pages that already wrap in .overflow-x-auto
    // simply get a no-op nested container.
    <div className="overflow-x-auto">
    <table className={className}>
      <thead className={theadClassName || undefined}>
        <tr>
          {columns.map((col, i) => {
            const sortable = col.sortable !== false;
            const active = sort?.index === i;
            return (
              <th
                key={i}
                aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                className={`table-header ${alignClass(col.align)} ${col.thClassName ?? ""}`}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-label={typeof col.header === "string" ? `Sort by ${col.header}` : undefined}
                    className={`group inline-flex items-center gap-1 uppercase tracking-[inherit] hover:opacity-80 ${
                      col.align === "right" ? "flex-row-reverse" : ""
                    } ${active ? "text-cyan-300" : ""}`}
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
        {sorted.map(renderRow)}
      </tbody>
      {footerRows && footerRows.length > 0 ? (
        <tfoot className="divide-y divide-white/10 border-t border-white/10">{footerRows.map(renderRow)}</tfoot>
      ) : null}
    </table>
    </div>
  );
}
