"use client";

import { useMemo, useState } from "react";
import { Search, ImageOff } from "lucide-react";
import { SortableTable } from "@/components/SortableTable";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";

export type PhotoListItem = {
  id: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  /** ISO string (Date is mapped server-side for a slim payload). */
  capturedAt: string | null;
  geoLat: number | null;
  geoLng: number | null;
  albumName: string | null;
};

/**
 * Photo library with a Drive-style grid/list toggle (spec
 * drive-view-sortable-tables §1-§5). Grid view preserves the original
 * thumbnail cards; list view is a compact sortable table. Both render the
 * same filtered set; view + sort persist (`photosViewMode`, `photosSort`).
 */
export function PhotosView({ photos }: { photos: PhotoListItem[] }) {
  const [viewMode, setViewMode] = useViewMode("photosViewMode");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter((p) =>
      [p.caption, p.albumName, p.capturedAt ? formatDateTime(p.capturedAt) : null].some((v) =>
        v?.toLowerCase().includes(q),
      ),
    );
  }, [photos, query]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {filtered.length} photo{filtered.length === 1 ? "" : "s"}{query ? ` matching “${query}”` : ""}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative" aria-label="Search photos">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search caption / album…"
              className="form-input h-9 w-48 pl-9 text-sm sm:w-64"
            />
          </label>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            icon={ImageOff}
            title={photos.length === 0 ? "No photos yet" : "No photos match your search"}
            description={
              photos.length === 0
                ? "Upload field photos above — capture is enabled for mobile cameras and EXIF geo/timestamp is preserved."
                : "Try a different caption or album name."
            }
          />
        </div>
      ) : viewMode === "list" ? (
        <section className="card p-0 overflow-hidden">
          <SortableTable
            storageKey="photosSort"
            theadClassName="bg-white/5"
            emptyMessage="No photos."
            columns={[
              { header: "Photo" },
              { header: "Album" },
              { header: "Captured" },
              { header: "Location" },
            ]}
            rows={filtered.map((p) => ({
              key: p.id,
              href: p.fileUrl,
              hrefTarget: "_blank" as const,
              className: "h-14 transition hover:bg-white/5",
              cells: [
                {
                  sort: p.caption ?? "",
                  node: (
                    <a
                      href={p.fileUrl}
                      target="_blank"
                      rel="noopener"
                      className="flex min-w-0 items-center gap-3"
                      aria-label={`Open full-size photo${p.caption ? `: ${p.caption}` : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumbnailUrl ?? p.fileUrl}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-lg bg-slate-900 object-cover"
                      />
                      <span className="truncate font-medium text-white">{p.caption ?? "(no caption)"}</span>
                    </a>
                  ),
                },
                { sort: p.albumName ?? "", node: p.albumName ? <span className="text-cyan-300">{p.albumName}</span> : "—" },
                {
                  sort: p.capturedAt ? new Date(p.capturedAt).getTime() : null,
                  node: p.capturedAt ? formatDateTime(p.capturedAt) : "—",
                  tdClassName: "text-slate-400",
                },
                {
                  sort: p.geoLat ?? null,
                  node: p.geoLat != null && p.geoLng != null ? `${p.geoLat.toFixed(4)}, ${p.geoLng.toFixed(4)}` : "—",
                  tdClassName: "text-slate-500 text-xs",
                },
              ],
            }))}
          />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <article key={p.id} className="card p-3">
              {/* Tap opens the full-resolution original — field users zoom into
                  detail shots; the grid thumb alone is too small on a phone. */}
              <a
                href={p.fileUrl}
                target="_blank"
                rel="noopener"
                className="block aspect-square overflow-hidden rounded-lg bg-slate-900"
                aria-label={`Open full-size photo${p.caption ? `: ${p.caption}` : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbnailUrl ?? p.fileUrl}
                  alt={p.caption || `Project photo${p.capturedAt ? ` from ${formatDateTime(p.capturedAt)}` : ""}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="mt-2 text-xs">
                <div className="text-white truncate">{p.caption ?? "(no caption)"}</div>
                <div className="text-slate-500">{p.capturedAt ? formatDateTime(p.capturedAt) : "—"}</div>
                {p.geoLat != null && p.geoLng != null ? (
                  <div className="text-slate-500 text-[10px]">{p.geoLat.toFixed(4)}, {p.geoLng.toFixed(4)}</div>
                ) : null}
                {p.albumName ? <div className="text-cyan-300 text-[10px]">{p.albumName}</div> : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
