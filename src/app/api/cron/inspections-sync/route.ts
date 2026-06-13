/**
 * POST /api/cron/inspections-sync
 *
 * Pulls fresh inspection data from every configured Charleston-area
 * permit portal for every tenant with active credentials. Intended to
 * be hit by the Windows Task Scheduler entry registered by
 * scripts/register-inspections-sync-task.ps1 (every 2 hours, 6am–10pm
 * America/New_York).
 *
 * Auth: bearer CRON_SECRET — same pattern as the other /api/cron/*
 * routes. Middleware excludes /api/cron/* from session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { runInspectionSync } from "@/lib/jurisdictions/sync";
import { authorizeCron, runCronJob } from "@/lib/cron";


export async function POST(req: NextRequest) {
  return runCronJob("inspections-sync", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "inspections-sync");
  if (denied) return denied;
  const start = Date.now();
  const summary = await runInspectionSync();
  return NextResponse.json({
    ok: summary.errors === 0,
    durationMs: Date.now() - start,
    ...summary,
  });
}

// GET is status-only and never runs the job — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req, "inspections-sync");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
