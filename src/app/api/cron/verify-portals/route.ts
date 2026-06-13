import { NextRequest, NextResponse } from "next/server";
import { verifyAllPortals } from "@/lib/portal-verify";
import { observeCronRun } from "@/lib/metrics";
import { authorizeCron, runCronJob } from "@/lib/cron";

/**
 * Scheduled portal-verification endpoint. Refreshes the catalog
 * lastVerifiedAt / Ok / Count / Note telemetry that the
 * /admin/portal-coverage page surfaces. Recommended cadence: weekly.
 *
 * Auth via CRON_SECRET bearer, same pattern as /api/cron/backup.
 * The middleware excludes /api/cron/* from session-based auth.
 */


export async function POST(req: NextRequest) {
  return runCronJob("verify-portals", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "verify-portals");
  if (denied) return denied;
  const start = Date.now();
  const result = await verifyAllPortals();
  observeCronRun({
    name: "verify-portals",
    startedAt: start,
    finishedAt: Date.now(),
    ok: true,
    message: typeof result === "object" && result ? `${(result as { verified?: number }).verified ?? "?"} portals checked` : "ok",
  });
  return NextResponse.json({ ok: true, ...result });
}

// GET is status-only and never runs the job — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req, "verify-portals");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
