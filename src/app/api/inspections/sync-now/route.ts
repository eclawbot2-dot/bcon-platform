import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { runInspectionSync } from "@/lib/jurisdictions/sync";
import { publicRedirect } from "@/lib/redirect";

/**
 * On-demand "Sync now" button — runs the same logic as the cron, but
 * triggered from the /inspections page by a logged-in manager. Avoids
 * the CRON_SECRET dance; auth is the session + role guard.
 */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  await requireManager(tenant.id);
  await runInspectionSync();
  return publicRedirect(req, "/inspections?scope=upcoming", 303);
}

export async function GET() {
  return NextResponse.json({ error: "POST only" }, { status: 405 });
}
