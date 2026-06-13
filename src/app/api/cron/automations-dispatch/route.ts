/**
 * POST /api/cron/automations-dispatch
 *
 * Tick the autonomous-workflow engine: run every enabled + due workflow
 * across all tenants. Cadence per workflow is gated in the DB (nextDueAt),
 * so this route can be called on a frequent (hourly) clock without
 * over-running daily/weekly workflows.
 *
 * Auth: bearer CRON_SECRET (timing-safe). 503 when CRON_SECRET is unset —
 * same fail-closed pattern as /api/cron/alert-scan. GET aliases POST.
 * Register hourly via scripts/register-automations-dispatch-task.ps1
 * (task name bcon-automations-dispatch).
 */

import { NextRequest, NextResponse } from "next/server";
import { dispatchDueWorkflows } from "@/lib/automations/engine";
import { observeCronRun } from "@/lib/metrics";
import { authorizeCron, runCronJob } from "@/lib/cron";


export async function POST(req: NextRequest) {
  return runCronJob("automations-dispatch", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "automations-dispatch");
  if (denied) return denied;
  const start = Date.now();
  const summary = await dispatchDueWorkflows();
  observeCronRun({
    name: "automations-dispatch",
    startedAt: start,
    finishedAt: Date.now(),
    ok: summary.ok,
    message: `considered ${summary.considered}; ran ${summary.ran}; skipped ${summary.skipped}; locked ${summary.locked}; pruned ${summary.pruned}; ${summary.errors} error(s)`,
  });
  return NextResponse.json({ durationMs: Date.now() - start, ...summary });
}

// GET is status-only and never runs the job — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req, "automations-dispatch");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
