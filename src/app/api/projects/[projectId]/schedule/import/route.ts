import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";
import { publicRedirect } from "@/lib/redirect";

/**
 * Import a project schedule from CSV. Expected columns (case-
 * insensitive header detection):
 *   wbs / activity_id, name, start, finish, duration_days,
 *   percent_complete, predecessors (FS-N format separated by ";").
 *
 * This is a CSV-shaped subset of P6 / MS Project XER export. Full
 * native XER/MPP parsers can replace this later; CSV keeps the
 * import-side dependency-free.
 *
 * On import: existing tasks are wiped and re-created from the file.
 * Pre-import baseline snapshot is captured automatically so the new
 * schedule can be variance-reported against the prior version.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const tenant = await requireTenant();
  const { projectId } = await ctx.params;
  // Browser form posts (Accept: text/html) get redirected back to the
  // schedule page with a flash message; programmatic callers keep JSON.
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");
  const fail = (message: string, status: number) =>
    wantsHtml
      ? publicRedirect(req, `/projects/${projectId}/schedule?error=${encodeURIComponent(message)}`, 303)
      : NextResponse.json({ error: message }, { status });

  // Re-importing wipes and replaces the entire baseline schedule — a
  // destructive edit. requireTenant alone proves only that the caller can
  // see the tenant, so previously a read-only viewer could erase a project's
  // whole schedule. Require an edit-capable role.
  try {
    await requireEditor(tenant.id);
  } catch {
    return fail("Editor-level role required to import a schedule.", 403);
  }
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) return fail("project not found", 404);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) return fail("csv file required", 422);
  // Bound the upload before buffering it: file.text() reads the whole body
  // into memory, so an unbounded multi-GB CSV could exhaust the heap.
  const MAX_CSV_BYTES = 15 * 1024 * 1024; // 15 MB — far beyond any real schedule export
  if (file.size > MAX_CSV_BYTES) return fail(`csv too large (max ${MAX_CSV_BYTES / (1024 * 1024)} MB)`, 413);
  const text = await file.text();

  // Parse CSV
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return fail("csv must have a header + at least one row", 422);
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iName = idx("name") >= 0 ? idx("name") : idx("activity_name");
  const iStart = idx("start") >= 0 ? idx("start") : idx("start_date");
  const iFinish = idx("finish") >= 0 ? idx("finish") : idx("finish_date");
  const iDur = idx("duration_days");
  const iPct = idx("percent_complete");
  const iWbs = idx("wbs") >= 0 ? idx("wbs") : idx("activity_id");

  if (iName < 0 || iStart < 0 || iFinish < 0) {
    return fail("missing required columns: name, start, finish", 422);
  }

  // Parse + validate every row BEFORE touching the database, so a malformed
  // file never reaches the destructive wipe below.
  const tasks: { name: string; start: Date; end: Date; duration: number; pct: number; wbs?: string }[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]!);
    const name = cells[iName]?.trim();
    const start = new Date(cells[iStart] ?? "");
    const end = new Date(cells[iFinish] ?? "");
    if (!name || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const duration = iDur >= 0 ? Number(cells[iDur]) : Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    const pct = iPct >= 0 ? Number(cells[iPct]) : 0;
    const wbs = iWbs >= 0 ? cells[iWbs] : undefined;
    tasks.push({ name, start, end, duration: duration || 1, pct: pct || 0, wbs });
  }
  if (tasks.length === 0) {
    return fail("no valid task rows found (need name + parseable start/finish)", 422);
  }

  // Snapshot baseline, wipe, and re-create as ONE atomic unit. The previous
  // code deleted the live schedule and then created the new tasks in a loop
  // with no transaction, so any failure mid-import (a bad row, a crash) left
  // the project with a half-deleted, half-rebuilt schedule and no way back.
  const baselineTaken = await prisma.$transaction(async (tx) => {
    const existing = await tx.scheduleTask.findMany({ where: { projectId } });
    if (existing.length > 0) {
      await tx.scheduleBaseline.create({
        data: {
          projectId,
          label: `Pre-import ${new Date().toISOString().slice(0, 10)}`,
          reason: "Schedule re-imported",
          payloadJson: JSON.stringify(existing),
        },
      });
    }
    await tx.scheduleTask.deleteMany({ where: { projectId } });
    await tx.scheduleTask.createMany({
      data: tasks.map((t) => ({
        projectId,
        name: t.name,
        startDate: t.start,
        endDate: t.end,
        durationDays: t.duration,
        percentComplete: t.pct,
        wbs: t.wbs,
      })),
    });
    return existing.length > 0;
  });

  if (wantsHtml) {
    const msg = `Imported ${tasks.length} tasks${baselineTaken ? " (prior schedule snapshotted as baseline)" : ""}`;
    return publicRedirect(req, `/projects/${projectId}/schedule?ok=${encodeURIComponent(msg)}`, 303);
  }
  return NextResponse.json({ imported: tasks.length, baseline: baselineTaken });
}

/**
 * Minimal RFC-4180 CSV line parser — splits by commas, respects
 * double-quoted fields (including escaped "" within them).
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i += 1; }
      else { cur += ch; i += 1; }
    } else {
      if (ch === ",") { out.push(cur); cur = ""; i += 1; }
      else if (ch === '"') { inQuotes = true; i += 1; }
      else { cur += ch; i += 1; }
    }
  }
  out.push(cur);
  return out;
}
