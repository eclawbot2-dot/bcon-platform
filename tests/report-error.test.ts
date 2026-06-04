import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportError, reportErrorNoWait } from "../src/lib/report-error";

/**
 * Error-monitoring sink. Always logs; only POSTs to a webhook when
 * ERROR_WEBHOOK_URL is set; and must NEVER throw (a crashing monitor is
 * worse than none).
 */

const ORIG_URL = process.env.ERROR_WEBHOOK_URL;

beforeEach(() => {
  delete process.env.ERROR_WEBHOOK_URL;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIG_URL === undefined) delete process.env.ERROR_WEBHOOK_URL;
  else process.env.ERROR_WEBHOOK_URL = ORIG_URL;
});

describe("reportError", () => {
  it("logs and does not fetch when no webhook configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportError({ scope: "test", error: new Error("boom") });
    expect(errSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs a JSON payload when ERROR_WEBHOOK_URL is set", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://hook.example/test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    await reportError({ scope: "cron/backup", error: "2 of 3 failed", context: { failed: 2 } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hook.example/test");
    expect(init.method).toBe("POST");
    const payload = JSON.parse(init.body as string);
    expect(payload.scope).toBe("cron/backup");
    expect(payload.message).toBe("2 of 3 failed");
    expect(payload.context.failed).toBe(2);
  });

  it("never throws when the webhook POST rejects", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://hook.example/test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(reportError({ scope: "test", error: "x" })).resolves.toBeUndefined();
  });

  it("reportErrorNoWait returns void synchronously", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(reportErrorNoWait({ scope: "test", error: "x" })).toBeUndefined();
  });
});
