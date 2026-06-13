import { NextRequest, NextResponse } from "next/server";
import { sweepAllSources } from "@/lib/rfp-autopilot";
import { observeCronRun } from "@/lib/metrics";
import { authorizeCron, runCronJob } from "@/lib/cron";

// Scheduled sweep endpoint — intended to be hit by an external scheduler
// (cron, Cloudflare Worker, GitHub Action) at least 6x per business day.
// Cadence gating inside sweepAllSources ensures we don't hammer sources.
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` header. We refuse to
// run without CRON_SECRET configured — an open cron endpoint lets anyone
// trigger external scrapes (cost + abuse risk) and exposes the autopilot's
// state across all tenants.


async function runSweep() {
  const start = Date.now();
  const result = await sweepAllSources();
  observeCronRun({
    name: "rfp-sweep",
    startedAt: start,
    finishedAt: Date.now(),
    ok: true,
    message: typeof result === "object" && result && "summary" in result ? String((result as { summary: unknown }).summary) : "completed",
  });
  return result;
}

export async function POST(req: NextRequest) {
  return runCronJob("rfp-sweep", () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const denied = authorizeCron(req, "rfp-sweep");
  if (denied) return denied;
  const result = await runSweep();
  return NextResponse.json(result);
}

// GET is status-only and never runs the sweep — schedulers must POST.
// Previously GET ran the full external scrape, so a "safe" verb triggered
// outbound scraping cost as a side effect.
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req, "rfp-sweep");
  if (denied) return denied;
  return NextResponse.json({ ok: true, status: "ready", note: "POST to run the sweep; GET is status-only." });
}
