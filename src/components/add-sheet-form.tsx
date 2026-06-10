"use client";

import { useState } from "react";

/**
 * Adds a sheet row to an existing drawing set. The create endpoint is
 * per-set (/api/drawings/[drawingId]/sheets/create), so the form's
 * action follows the selected set. Plain form POST — the route 303s
 * back to the project drawings page.
 */
export function AddSheetForm({ drawings }: { drawings: Array<{ id: string; setName: string; revisionNumber: number }> }) {
  const [drawingId, setDrawingId] = useState(drawings[0]?.id ?? "");
  if (drawings.length === 0) return null;

  return (
    <form action={`/api/drawings/${drawingId}/sheets/create`} method="post" className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_1.6fr_auto_auto]">
      <label className="sr-only" htmlFor="sheet-set">Drawing set</label>
      <select id="sheet-set" value={drawingId} onChange={(e) => setDrawingId(e.target.value)} className="form-select">
        {drawings.map((d) => (
          <option key={d.id} value={d.id}>{d.setName} · rev #{d.revisionNumber}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="sheet-number">Sheet number</label>
      <input id="sheet-number" name="sheetNumber" required placeholder="Sheet # (e.g. A1.1)" className="form-input" />
      <label className="sr-only" htmlFor="sheet-title">Sheet title</label>
      <input id="sheet-title" name="title" required placeholder="Title (e.g. Site Plan)" className="form-input" />
      <label className="sr-only" htmlFor="sheet-page">Page</label>
      <input id="sheet-page" name="pageNumber" type="number" min={1} placeholder="Pg" aria-label="Page number (optional)" className="form-input w-20" />
      <button className="btn-primary text-xs">Add sheet</button>
    </form>
  );
}
