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
import { authorizeCron, runCronJob } from "@/lib/cron";


export async function POST(req: NextRequest) {
  return runCronJob("mail-ingest", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "mail-ingest");
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
  const denied = authorizeCron(req, "mail-ingest");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
