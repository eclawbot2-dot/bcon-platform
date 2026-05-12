/**
 * Tests for the structured logging facade. Drives the prod JSON-line
 * path (process.stdout.write) and the dev color-coded path. Mocked
 * sinks so test output stays clean and assertions can verify shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/metrics", () => ({ observeError: vi.fn() }));

import { log } from "@/lib/log";

const ORIG_ENV = process.env.NODE_ENV;

beforeEach(() => {
  // Default to prod so we exercise the JSON-line path which is easier
  // to assert against. Individual tests override to "development".
  process.env.NODE_ENV = "production";
});

afterEach(() => {
  process.env.NODE_ENV = ORIG_ENV;
  vi.restoreAllMocks();
});

describe("log (production JSON mode)", () => {
  it("emits a JSON line per call with level + message + ctx", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    log.info("hello", { tenantId: "t1", module: "test" });
    expect(writes.length).toBe(1);
    const obj = JSON.parse(writes[0]);
    expect(obj.level).toBe("info");
    expect(obj.message).toBe("hello");
    expect(obj.tenantId).toBe("t1");
    expect(obj.module).toBe("test");
    expect(typeof obj.t).toBe("string");
  });

  it("captures Error name/message/stack in JSON", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    log.error("oops", { module: "test" }, new Error("boom"));
    const obj = JSON.parse(writes[0]);
    expect(obj.error.name).toBe("Error");
    expect(obj.error.message).toBe("boom");
    expect(typeof obj.error.stack).toBe("string");
  });

  it("captures non-Error throws as String()", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    log.warn("oddity", { module: "x" }, "string error");
    const obj = JSON.parse(writes[0]);
    expect(obj.error).toBe("string error");
  });

  it("debug / info / warn / error all emit", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(writes.length).toBe(4);
    expect(JSON.parse(writes[0]).level).toBe("debug");
    expect(JSON.parse(writes[3]).level).toBe("error");
  });
});

describe("log (dev colorized mode)", () => {
  it("uses console methods, not process.stdout.write", () => {
    process.env.NODE_ENV = "development";
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("hello-dev", { module: "test" });
    expect(consoleInfoSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
