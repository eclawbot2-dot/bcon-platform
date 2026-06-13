import { NextRequest, NextResponse } from "next/server";
import { captureWeatherAll } from "@/lib/weather";
import { observeCronRun } from "@/lib/metrics";
import { reportError } from "@/lib/report-error";
import { authorizeCron, runCronJob } from "@/lib/cron";

/**
 * Weather auto-capture cron. For every non-warranty project with resolvable
 * coordinates, pulls current conditions from Open-Meteo (free, no key) and
 * writes them into that project's daily log for the day. Idempotent per
 * (project, day).
 *
 * Auth: Bearer CRON_SECRET, identical to the other /api/cron/* endpoints.
 * The middleware excludes /api/cron/* from session auth.
 */


export async function POST(req: NextRequest) {
  return runCronJob("weather-capture", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "weather-capture");
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
  const denied = authorizeCron(req, "weather-capture");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run weather capture; GET is status-only." });
}
