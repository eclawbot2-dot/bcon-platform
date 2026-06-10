import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveQueueFromEnv } from "../src/lib/queue";

/**
 * Transport-resolution tests for the job queue. QUEUE_TRANSPORT=bullmq /
 * inngest are not implemented; requesting one must fail fast in
 * production (jobs silently running in-process would vanish on restart)
 * and warn-with-fallback in dev.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveQueueFromEnv", () => {
  it("defaults to in-process", () => {
    expect(resolveQueueFromEnv({} as unknown as NodeJS.ProcessEnv, "production").name).toBe("in-process");
  });

  it("THROWS in production when an unimplemented transport is requested", () => {
    expect(() => resolveQueueFromEnv({ QUEUE_TRANSPORT: "bullmq" } as unknown as NodeJS.ProcessEnv, "production")).toThrowError(/bullmq/);
    expect(() => resolveQueueFromEnv({ QUEUE_TRANSPORT: "inngest" } as unknown as NodeJS.ProcessEnv, "production")).toThrowError(/inngest/);
  });

  it("warns and falls back to in-process outside production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveQueueFromEnv({ QUEUE_TRANSPORT: "bullmq" } as unknown as NodeJS.ProcessEnv, "test").name).toBe("in-process");
    expect(warn).toHaveBeenCalledOnce();
  });
});
