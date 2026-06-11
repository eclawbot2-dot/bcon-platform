import Link from "next/link";
import type { ReactNode } from "react";
import { SortableTable, type SortColumn, type SortRow } from "@/components/SortableTable";
import type { SortValue } from "@/lib/sort";

export type DataTableColumn<T> = {
  /** Stable key for React reconciliation. */
  key: string;
  /** Column header text. Pass empty string for action columns. */
  header: ReactNode;
  /** Optional cell renderer. If omitted, the column displays
   *  `String(row[key])` from the source object — convenient for plain
   *  string/number fields without writing a render function. */
  render?: (row: T) => ReactNode;
  /** Primitive used for click-to-sort on this column. When omitted, the raw
   *  `row[key]` value is used if it is a string/number/boolean/Date. Columns
   *  where neither yields a sortable value render as plain (non-sortable)
   *  headers automatically. */
  sortValue?: (row: T) => SortValue;
  /** Set false to disable sorting (action columns etc.). Default true. */
  sortable?: boolean;
  /** Tailwind classes to apply to every cell in this column. Use for
   *  alignment, color, or width hints. */
  cellClassName?: string;
  /** Tailwind classes for the header cell only. */
  headerClassName?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Function returning a unique React key for each row. Pass when the
   *  row's natural id is not at row.id. */
  rowKey?: (row: T) => string;
  /** When set, each row becomes a Link to the returned href and gains a
   *  hover/cursor affordance. */
  getRowHref?: (row: T) => string | null | undefined;
  /** Message shown when rows.length === 0. Pass a richer ReactNode for
   *  custom empty states (or use the EmptyState component above the table
   *  and pass an empty array of rows here). */
  emptyMessage?: ReactNode;
  /** Class for the outer wrapper. Default applies the .card style. */
  wrapperClassName?: string;
  /** localStorage key to persist the active sort across visits (spec §9). */
  sortStorageKey?: string;
};

function defaultSortValue(raw: unknown): SortValue {
  if (raw instanceof Date) return raw;
  const t = typeof raw;
  if (t === "string" || t === "number" || t === "boolean") return raw as SortValue;
  return undefined;
}

/**
 * Shared list-page table.
 *
 * Background (audit Pass 7 §4.3): the codebase had ~17 components for
 * 113 pages, with extensive duplication of <table>/<thead>/<tbody>
 * markup across list pages. This component absorbs the shape so adding
 * a new module's list page is `<DataTable columns={...} rows={...} />`
 * instead of 30 lines of JSX every time.
 *
 * Sorting (spec drive-view-sortable-tables §6): this stays a server
 * component — render functions execute here, producing serializable
 * ReactNodes — and delegates the interactive table to the client-side
 * SortableTable, so every DataTable page gets click-to-sort headers for
 * free. Columns whose `key` maps to a primitive field sort on the raw
 * value automatically; computed columns pass `sortValue`. Columns with
 * no sortable value in any row degrade to plain headers.
 *
 * Theming: relies on the existing .card / .table-header / .table-cell
 * utility classes already in globals.css. No hardcoded grays — light
 * and dark themes both render correctly via CSS variables.
 *
 * Accessibility: real <th>/<button> sort headers with aria-sort from
 * SortableTable. Rows with hrefs wrap the first cell in a <Link> (single
 * keyboard target) and the whole row is clickable.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  getRowHref,
  emptyMessage = "No records yet.",
  wrapperClassName = "card p-0 overflow-hidden",
  sortStorageKey,
}: DataTableProps<T>) {
  const keyOf = rowKey ?? ((row: T) => String((row as { id?: unknown }).id ?? Math.random()));

  // Track per-column whether any row produced a sortable value, so columns
  // without data (or pure action columns) don't render dead sort buttons.
  const columnHasSort = columns.map((col) => col.sortable !== false && Boolean(col.sortValue));

  const sortRows: SortRow[] = rows.map((row) => {
    const href = getRowHref?.(row) ?? null;
    return {
      key: keyOf(row),
      className: "transition hover:bg-white/5",
      href: href ?? undefined,
      cells: columns.map((col, ci) => {
        const raw = (row as Record<string, unknown>)[col.key];
        const content: ReactNode = col.render ? col.render(row) : (raw as ReactNode);
        const sort = col.sortValue ? col.sortValue(row) : defaultSortValue(raw);
        if (!col.sortValue && sort !== undefined) columnHasSort[ci] = col.sortable !== false;
        const node =
          href && ci === 0 ? (
            // First column wraps the row link to give keyboard focus a single target.
            <Link
              href={href}
              className="font-medium text-white hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              {content}
            </Link>
          ) : (
            content
          );
        return { sort, node, tdClassName: col.cellClassName };
      }),
    };
  });

  const sortColumns: SortColumn[] = columns.map((col, ci) => ({
    header: col.header,
    sortable: columnHasSort[ci],
    thClassName: col.headerClassName,
  }));

  return (
    <section className={wrapperClassName}>
      <SortableTable
        columns={sortColumns}
        rows={sortRows}
        emptyMessage={emptyMessage}
        storageKey={sortStorageKey}
        theadClassName="bg-white/5"
      />
    </section>
  );
}
