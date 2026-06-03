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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function authorize(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
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

export async function GET(req: NextRequest) {
  return POST(req);
}
