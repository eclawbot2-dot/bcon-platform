/**
 * POST /api/cron/mail-ingest
 *
 * Workspace-transparency poller. Pulls recent mail for every tenant whose
 * MailConnection is ENABLED, dedupes + classifies, and stores tenant-scoped
 * MailMessage rows. Tenants without a connection, or with enabled=false, are
 * skipped entirely — the feature is opt-in.
 *
 * Auth: bearer CRON_SECRET — same pattern as the other /api/cron/* routes.
 * Middleware excludes /api/cron/* from session auth. Register daily via
 * scripts/register-mail-ingest-task.ps1 (mirrors bcon-alert-scan).
 */

import { NextRequest, NextResponse } from "next/server";
import { ingestAllEnabledTenants } from "@/lib/mail/ingest";
import { observeCronRun } from "@/lib/metrics";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorize(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
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
  const sinceDays = Number(req.nextUrl.searchParams.get("days") ?? "7") || 7;
  const summary = await ingestAllEnabledTenants(sinceDays);
  observeCronRun({
    name: "mail-ingest",
    startedAt: start,
    finishedAt: Date.now(),
    ok: summary.errors.length === 0,
    message: `polled ${summary.tenants} tenant(s); ingested ${summary.ingested}; scanned ${summary.scanned}; ${summary.errors.length} error(s)`,
  });
  return NextResponse.json({ durationMs: Date.now() - start, ...summary });
}

// GET is status-only and never runs the job — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
