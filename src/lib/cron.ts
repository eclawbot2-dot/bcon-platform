import { NextResponse } from "next/server";
import { observeCronRun } from "@/lib/metrics";
import { reportError } from "@/lib/report-error";

/**
 * Top-level fault guard for cron route handlers.
 *
 * Each /api/cron/* POST handler already reports *partial* failures (the
 * per-tenant/per-project work returns a summary with error counts). What
 * they lacked was a guard for a *total* throw — e.g. the database is down,
 * a job helper throws before its own try/catch, or an unexpected runtime
 * error. Without this, such a failure returns an opaque 500 and — worse —
 * never records an observeCronRun() sample (so the observability dashboard
 * keeps showing the cron's last *successful* run, hiding the outage) and
 * never fires reportError() (so no operator alert). For a DR-critical job
 * like the nightly backup that is a silent, invisible failure.
 *
 * Wrap a handler's work in runCronJob(): on a thrown error it records a
 * failed cron sample, funnels the error to the monitor, and returns a clean
 * 500 JSON body. Authorized-but-rejected responses (401/503 from the
 * bearer-token check) are plain returns, not throws, so they pass through
 * untouched and are never misreported as job failures.
 */
export async function runCronJob(
  name: string,
  job: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    return await job();
  } catch (error) {
    observeCronRun({
      name,
      startedAt,
      finishedAt: Date.now(),
      ok: false,
      message: error instanceof Error ? `threw: ${error.message}` : "threw: unknown error",
    });
    await reportError({
      scope: `cron/${name}`,
      error,
      level: "error",
      context: { cron: name },
    });
    return NextResponse.json({ ok: false, error: "cron job failed" }, { status: 500 });
  }
}
