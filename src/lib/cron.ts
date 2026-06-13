import { NextResponse } from "next/server";
import { observeCronRun } from "@/lib/metrics";
import { reportError } from "@/lib/report-error";

/** Constant-time string compare — avoids leaking the secret via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Shared bearer-token gate for every /api/cron/* handler. The middleware
 * matcher excludes /api/cron/* from session auth, so each cron route MUST
 * authenticate itself with the shared CRON_SECRET.
 *
 * Fail-closed: a missing/blank secret returns 503 (never an open door), a
 * mismatched/absent header returns 401. Returns `null` when authorized so
 * callers can `const denied = authorizeCron(req, name); if (denied) return denied;`.
 *
 * This was previously copy-pasted (timingSafeEqual + authorize) into all
 * nine cron route files; hoisting it removes that drift risk — a fix to the
 * auth check now lands in exactly one place.
 */
export function authorizeCron(req: Request, name: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[cron/${name}] CRON_SECRET not configured`);
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

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
