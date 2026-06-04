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
  const summary = await runInspectionSync();
  return NextResponse.json({
    ok: summary.errors === 0,
    durationMs: Date.now() - start,
    ...summary,
  });
}

// GET is status-only and never runs the job — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
