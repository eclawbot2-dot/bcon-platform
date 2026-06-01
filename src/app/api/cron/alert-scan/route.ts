/**
 * POST /api/cron/alert-scan
 *
 * Platform-wide alert sweep. Runs the alert engine (permit/insurance/
 * vendor-prequal expiry, overdue RFIs, budget/commitment over-run, stale
 * pay-apps awaiting approval, outstanding lien waivers, stalled submittals)
 * for every tenant and dispatches the resulting notifications.
 *
 * Previously the alert scan was only reachable via the per-tenant,
 * session-gated /api/alerts/scan endpoint — i.e. a human had to click it.
 * This route makes the same engine clock-driven so expiry and due-date
 * alerts actually fire on time. Register it daily (early AM) via
 * scripts/register-alert-scan-task.ps1.
 *
 * Auth: bearer CRON_SECRET — same pattern as the other /api/cron/* routes.
 * Middleware excludes /api/cron/* from session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAlertScanAllTenants } from "@/lib/alerts";
import { observeCronRun } from "@/lib/metrics";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorize(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!timingSafeEqual(header, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  const start = Date.now();
  const summary = await runAlertScanAllTenants();
  observeCronRun({
    name: "alert-scan",
    startedAt: start,
    finishedAt: Date.now(),
    ok: summary.ok,
    message: `scanned ${summary.tenantsScanned} tenant(s); produced ${summary.produced} alert(s); ${summary.errors} error(s)`,
  });
  return NextResponse.json({ durationMs: Date.now() - start, ...summary });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
