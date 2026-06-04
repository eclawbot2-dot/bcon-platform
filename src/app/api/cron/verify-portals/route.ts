import { NextRequest, NextResponse } from "next/server";
import { verifyAllPortals } from "@/lib/portal-verify";
import { observeCronRun } from "@/lib/metrics";

/**
 * Scheduled portal-verification endpoint. Refreshes the catalog
 * lastVerifiedAt / Ok / Count / Note telemetry that the
 * /admin/portal-coverage page surfaces. Recommended cadence: weekly.
 *
 * Auth via CRON_SECRET bearer, same pattern as /api/cron/backup.
 * The middleware excludes /api/cron/* from session-based auth.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorize(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/verify-portals] CRON_SECRET not configured");
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
  const denied = authorize(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
