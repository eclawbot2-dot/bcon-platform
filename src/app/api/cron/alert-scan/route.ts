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
import { authorizeCron, runCronJob } from "@/lib/cron";


export async function POST(req: NextRequest) {
  return runCronJob("alert-scan", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "alert-scan");
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

// GET is status-only and never runs the job — schedulers must POST.
// (Previously GET aliased to POST, letting a "safe" verb trigger the
// mutation as a side effect.)
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req, "alert-scan");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
