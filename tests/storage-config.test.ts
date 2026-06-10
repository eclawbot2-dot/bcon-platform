import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveStorageFromEnv } from "../src/lib/storage";

/**
 * Transport-resolution tests for the storage adapter — specifically the
 * fail-closed misconfiguration behaviour: STORAGE_TRANSPORT=s3/r2 with
 * incomplete STORAGE_S3_* config must THROW in production (never silently
 * fall back to local disk) and must name the missing vars.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const FULL_S3 = {
  STORAGE_TRANSPORT: "s3",
  STORAGE_S3_BUCKET: "test-bucket",
  STORAGE_S3_ACCESS_KEY: "AKIATEST",
  STORAGE_S3_SECRET_KEY: "secret",
} as unknown as NodeJS.ProcessEnv;

describe("resolveStorageFromEnv", () => {
  it("defaults to local disk when STORAGE_TRANSPORT is unset", () => {
    expect(resolveStorageFromEnv({} as unknown as NodeJS.ProcessEnv, "production").name).toBe("local");
  });

  it("selects the memory adapter for STORAGE_TRANSPORT=memory", () => {
    expect(resolveStorageFromEnv({ STORAGE_TRANSPORT: "memory" } as unknown as NodeJS.ProcessEnv, "test").name).toBe("memory");
  });

  it("selects the s3 adapter when all required vars are present", () => {
    expect(resolveStorageFromEnv(FULL_S3, "production").name).toBe("s3");
  });

  it("accepts r2 as an alias for the s3 adapter", () => {
    expect(resolveStorageFromEnv({ ...FULL_S3, STORAGE_TRANSPORT: "r2" }, "production").name).toBe("s3");
  });

  it("THROWS in production when s3 is requested but vars are missing, naming them", () => {
    const env = { STORAGE_TRANSPORT: "s3", STORAGE_S3_BUCKET: "b" } as unknown as NodeJS.ProcessEnv;
    expect(() => resolveStorageFromEnv(env, "production")).toThrowError(/STORAGE_S3_ACCESS_KEY, STORAGE_S3_SECRET_KEY/);
  });

  it("treats blank-string vars as missing", () => {
    const env = { ...FULL_S3, STORAGE_S3_SECRET_KEY: "   " } as unknown as NodeJS.ProcessEnv;
    expect(() => resolveStorageFromEnv(env, "production")).toThrowError(/STORAGE_S3_SECRET_KEY/);
  });

  it("falls back to local with a warning outside production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { STORAGE_TRANSPORT: "s3" } as unknown as NodeJS.ProcessEnv;
    expect(resolveStorageFromEnv(env, "development").name).toBe("local");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toMatch(/STORAGE_S3_BUCKET/);
  });
});
