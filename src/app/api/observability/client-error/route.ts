import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";

/**
 * Beacon endpoint for the client error boundary (error.tsx). The boundary
 * is a client component, so it can't call reportError (which reads server
 * env + may hold a webhook secret) directly. It POSTs a compact, non-PII
 * payload here and we funnel it into the same server-side error monitor as
 * cron + audit failures.
 *
 * This route is behind the normal session middleware (it's under /api and
 * not in the cron/auth allowlist), so only authenticated users can post —
 * which also bounds abuse of the webhook.
 */
export async function POST(req: NextRequest) {
  let body: { digest?: unknown; message?: unknown; path?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const digest = typeof body.digest === "string" ? body.digest.slice(0, 200) : undefined;
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "client error boundary triggered";
  const path = typeof body.path === "string" ? body.path.slice(0, 300) : undefined;

  await reportError({
    scope: "client/error-boundary",
    error: message,
    level: "error",
    context: { digest, path },
  });

  return NextResponse.json({ ok: true });
}
