import { NextResponse } from "next/server";
import { createTimesheet } from "@/lib/timesheets";
import { requireTenant } from "@/lib/tenant";
import { publicRedirect } from "@/lib/redirect";
import { parseNumberField } from "@/lib/form-input";

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const employeeName = String(form.get("employeeName") ?? "").trim();
  const trade = String(form.get("trade") ?? "").trim() || undefined;
  const weekEnding = String(form.get("weekEnding") ?? "");
  // Use parseNumberField so non-numeric / garbage input becomes 0 instead
  // of NaN (which would otherwise be written to the DB). Hours are clamped
  // to a sane 0..168 week; rate is non-negative.
  const regularHours = parseNumberField(form.get("regularHours"), 0, { min: 0, max: 168 }) ?? 0;
  const overtimeHours = parseNumberField(form.get("overtimeHours"), 0, { min: 0, max: 168 }) ?? 0;
  const doubleTimeHours = parseNumberField(form.get("doubleTimeHours"), 0, { min: 0, max: 168 }) ?? 0;
  const rate = parseNumberField(form.get("rate"), 0, { min: 0 }) ?? 0;
  const costCode = String(form.get("costCode") ?? "").trim() || undefined;
  const notes = String(form.get("notes") ?? "").trim() || undefined;
  if (!projectId || !employeeName || !weekEnding) {
    return NextResponse.json({ error: "projectId, employeeName, and weekEnding required" }, { status: 400 });
  }
  const weekEndingDate = new Date(weekEnding);
  if (Number.isNaN(weekEndingDate.getTime())) {
    return NextResponse.json({ error: "weekEnding is not a valid date" }, { status: 400 });
  }
  const result = await createTimesheet(tenant.id, {
    projectId,
    employeeName,
    trade,
    weekEnding: weekEndingDate,
    regularHours,
    overtimeHours,
    doubleTimeHours,
    rate,
    costCode,
    notes,
  });
  if (!result.ok || !result.entry) return NextResponse.json({ error: result.error }, { status: 400 });
  return publicRedirect(req, `/timesheets/${result.entry.id}`, 303);
}
