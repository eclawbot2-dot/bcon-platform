import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { observeCronRun } from "@/lib/metrics";

/**
 * Audit-event retention cron. Deletes AuditEvent rows older than 365
 * days. Compliance + DB hygiene — without this, the audit table grows
 * without bound and slow-paths the /admin/audit and /settings/audit
 * pages over time.
 *
 * Auth: bearer CRON_SECRET, same pattern as /api/cron/backup.
 *
 * Configurable retention via ?days=N query param (caller can request
 * a longer hold for a specific compliance window). Floor 30 days so
 * a misconfigured cron can't accidentally wipe recent activity.
 */

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

  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("days") ?? "365");
  const days = Number.isFinite(requested) ? Math.max(30, Math.floor(requested)) : 365;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Circuit breaker: count what would be deleted before doing the
  // delete. If a leaked CRON_SECRET is being used to wipe the audit
  // log, the attacker would have to issue many requests as ?days
  // shrinks toward 30 — but a single request that would obliterate
  // years of evidence (>50k rows) refuses to execute and returns 409.
  // Operators with legitimate need can override via ?force=1.
  const wouldDelete = await prisma.auditEvent.count({ where: { createdAt: { lt: cutoff } } });
  const force = url.searchParams.get("force") === "1";
  const MAX_BATCH = 50_000;
  if (wouldDelete > MAX_BATCH && !force) {
    observeCronRun({ name: "audit-prune", startedAt: start, finishedAt: Date.now(), ok: false, message: `safety cap blocked ${wouldDelete} > ${MAX_BATCH}` });
    return NextResponse.json({
      ok: false,
      error: `would delete ${wouldDelete} events, exceeds safety cap ${MAX_BATCH}. Pass ?force=1 to override.`,
      cutoff: cutoff.toISOString(),
      retentionDays: days,
      wouldDelete,
    }, { status: 409 });
  }

  const result = await prisma.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  observeCronRun({ name: "audit-prune", startedAt: start, finishedAt: Date.now(), ok: true, message: `${result.count} events pruned (retention ${days}d)` });
  return NextResponse.json({
    ok: true,
    cutoff: cutoff.toISOString(),
    retentionDays: days,
    deleted: result.count,
  });
}

// GET is status-only and never runs the job — schedulers must POST.
export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run; GET is status-only." });
}
