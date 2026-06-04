import { NextRequest, NextResponse } from "next/server";
import { captureWeatherAll } from "@/lib/weather";
import { observeCronRun } from "@/lib/metrics";
import { reportError } from "@/lib/report-error";

/**
 * Weather auto-capture cron. For every non-warranty project with resolvable
 * coordinates, pulls current conditions from Open-Meteo (free, no key) and
 * writes them into that project's daily log for the day. Idempotent per
 * (project, day).
 *
 * Auth: Bearer CRON_SECRET, identical to the other /api/cron/* endpoints.
 * The middleware excludes /api/cron/* from session auth.
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
    console.error("[cron/weather-capture] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;

  const start = Date.now();
  const results = await captureWeatherAll();
  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const failed = results.filter((r) => !r.ok).length;

  observeCronRun({
    name: "weather-capture",
    startedAt: start,
    finishedAt: Date.now(),
    ok: failed === 0,
    message: `${created} created / ${updated} updated / ${failed} failed across ${results.length} projects`,
  });

  if (failed > 0) {
    await reportError({
      scope: "cron/weather-capture",
      error: `${failed} of ${results.length} project weather captures failed`,
      context: { failed, projects: results.filter((r) => !r.ok).map((r) => ({ projectId: r.projectId, error: r.error })) },
    });
  }

  return NextResponse.json({
    ok: failed === 0,
    durationMs: Date.now() - start,
    projectCount: results.length,
    created,
    updated,
    failed,
    results,
  });
}

// GET is status-only — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run weather capture; GET is status-only." });
}
