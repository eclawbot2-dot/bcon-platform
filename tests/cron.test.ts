/**
 * Tests for runCronJob — the top-level fault guard wrapping every
 * /api/cron/* handler. The critical behavior: a thrown job must NOT
 * produce a silent 500. It has to (a) return a clean 500 JSON, (b) record
 * a failed observeCronRun sample so the observability dashboard reflects
 * the outage instead of the last success, and (c) funnel the error to the
 * monitor. A regression here turns a DR-critical failure (e.g. the nightly
 * backup throwing) invisible.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { runCronJob } from "@/lib/cron";
import { snapshot, __resetForTest } from "@/lib/metrics";

describe("runCronJob", () => {
  beforeEach(() => {
    __resetForTest();
    vi.restoreAllMocks();
  });

  it("returns the job's response unchanged on success", async () => {
    const ok = NextResponse.json({ ok: true, ran: 3 });
    const res = await runCronJob("test-job", async () => ok);
    expect(res).toBe(ok);
    expect(res.status).toBe(200);
    // No failed sample recorded on the happy path (the job records its own).
    const failed = snapshot().cronRuns.find((c) => c.name === "test-job");
    expect(failed).toBeUndefined();
  });

  it("converts a thrown job into a clean 500 and records a failed sample", async () => {
    // Silence the expected reportError stderr line.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runCronJob("boom-job", async () => {
      throw new Error("db is down");
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("cron job failed");

    const sample = snapshot().cronRuns.find((c) => c.name === "boom-job");
    expect(sample).toBeDefined();
    expect(sample!.ok).toBe(false);
    expect(sample!.message).toContain("db is down");

    // The error was funneled to the reporter (which logs to stderr).
    expect(errSpy).toHaveBeenCalled();
  });

  it("does not misreport an authorize() early-return as a failure", async () => {
    // Handlers return a 401/503 (not throw) when the bearer check fails;
    // that must pass through untouched with no failed cron sample.
    const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const res = await runCronJob("auth-job", async () => denied);
    expect(res.status).toBe(401);
    expect(snapshot().cronRuns.find((c) => c.name === "auth-job")).toBeUndefined();
  });
});
