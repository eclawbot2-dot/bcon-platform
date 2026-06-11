import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { syncPayAppDueToCalendar } from "@/lib/m365-calendar";
import { publicRedirect } from "@/lib/redirect";

/**
 * Create/update the Microsoft 365 calendar event for one pay application's
 * payment-due date. Manager-gated (same level as the pay-app workflow
 * actions). Idempotent — re-posting updates the existing event.
 */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireManager(tenant.id);
  const form = await req.formData();
  const payAppId = String(form.get("payAppId") ?? "").trim();
  if (!payAppId) return NextResponse.json({ error: "payAppId required" }, { status: 400 });

  const result = await syncPayAppDueToCalendar(tenant.id, payAppId);

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "PayApplication",
    entityId: payAppId,
    action: "m365.calendar.sync",
    after: result.ok ? { action: result.action, eventId: result.eventId } : { error: result.error },
    source: "pay-app-detail",
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return publicRedirect(req, req.headers.get("referer") ?? "/", 303);
}
