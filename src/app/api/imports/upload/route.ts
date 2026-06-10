import { NextResponse } from "next/server";
import { ingestSpreadsheet } from "@/lib/historical-import";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { HistoricalImportKind } from "@prisma/client";
import { publicRedirect } from "@/lib/redirect";

const VALID_KINDS: HistoricalImportKind[] = ["PROJECT_ACTUALS", "BID_HISTORY", "INCOME_STATEMENT", "BUDGET_TEMPLATE", "SCHEDULE_OF_VALUES", "VENDOR_LIST"];

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireEditor(tenant.id);
  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "PROJECT_ACTUALS");
  const label = String(form.get("label") ?? "Untitled import").trim() || "Untitled import";
  const projectId = String(form.get("projectId") ?? "") || null;
  const kind = VALID_KINDS.includes(kindRaw as HistoricalImportKind) ? (kindRaw as HistoricalImportKind) : "PROJECT_ACTUALS";

  if (!(file instanceof File)) return NextResponse.json({ error: "file is required (multipart/form-data)" }, { status: 400 });
  // Bound the upload before buffering it: file.text() reads the whole body
  // into memory, so an unbounded multi-GB upload could exhaust the heap.
  const MAX_CSV_BYTES = 15 * 1024 * 1024; // 15 MB — far beyond any real spreadsheet export
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: `file too large (max ${MAX_CSV_BYTES / (1024 * 1024)} MB)` }, { status: 413 });
  }
  const csv = await file.text();

  // Persist the raw upload via the storage adapter so the original artifact
  // survives the parse step. Failures here are non-fatal: the parse-and-
  // ingest path still works, just without the file URL on the row.
  let stored: { url: string; key: string } | null = null;
  try {
    const result = await getStorage().put({
      tenantId: tenant.id,
      body: csv,
      filename: file.name,
      contentType: "text/csv",
    });
    stored = { url: result.url, key: result.key };
  } catch (err) {
    console.error("[imports/upload] storage.put failed; continuing without artifact", err);
  }

  const imp = await ingestSpreadsheet({
    tenantId: tenant.id,
    projectId,
    kind,
    label,
    filename: file.name,
    fileSize: file.size,
    csv,
    uploadedBy: actor.userName,
    fileUrl: stored?.url ?? null,
    fileKey: stored?.key ?? null,
  });
  return publicRedirect(req, `/imports/${imp.id}`, 303);
}
