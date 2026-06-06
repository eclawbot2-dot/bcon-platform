import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";

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
  // Re-importing wipes and replaces the entire baseline schedule — a
  // destructive edit. requireTenant alone proves only that the caller can
  // see the tenant, so previously a read-only viewer could erase a project's
  // whole schedule. Require an edit-capable role.
  try {
    await requireEditor(tenant.id);
  } catch {
    return NextResponse.json({ error: "Editor-level role required to import a schedule." }, { status: 403 });
  }
  const { projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "csv file required" }, { status: 422 });
  const text = await file.text();

  // Parse CSV
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return NextResponse.json({ error: "csv must have a header + at least one row" }, { status: 422 });
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iName = idx("name") >= 0 ? idx("name") : idx("activity_name");
  const iStart = idx("start") >= 0 ? idx("start") : idx("start_date");
  const iFinish = idx("finish") >= 0 ? idx("finish") : idx("finish_date");
  const iDur = idx("duration_days");
  const iPct = idx("percent_complete");
  const iWbs = idx("wbs") >= 0 ? idx("wbs") : idx("activity_id");

  if (iName < 0 || iStart < 0 || iFinish < 0) {
    return NextResponse.json({ error: "missing required columns: name, start, finish" }, { status: 422 });
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
    return NextResponse.json({ error: "no valid task rows found (need name + parseable start/finish)" }, { status: 422 });
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
