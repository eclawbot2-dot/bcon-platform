import { describe, it, expect } from "vitest";
import { verifyBackupContents } from "../src/lib/backup";

describe("verifyBackupContents", () => {
  // Mirrors the real backupTenant() output shape: { meta, rowCounts, data }.
  const validShape = {
    meta: { tenantId: "t_1", tenantSlug: "acme", schemaVersion: 1 },
    rowCounts: { project: 3 },
    data: { project: [{ id: "p_1" }] },
  };

  it("accepts a well-formed backup payload", () => {
    expect(() => verifyBackupContents(JSON.stringify(validShape))).not.toThrow();
  });

  it("rejects truncated JSON", () => {
    // Slice off the closing brace so JSON.parse hits an unterminated
    // object — the realistic disk-full-at-flush failure mode.
    const full = JSON.stringify(validShape);
    const truncated = full.slice(0, full.length - 5);
    expect(() => verifyBackupContents(truncated)).toThrow(/JSON parse failed/);
  });

  it("rejects non-JSON garbage", () => {
    expect(() => verifyBackupContents("not json at all")).toThrow(/JSON parse failed/);
  });

  it("rejects when top-level meta key is missing", () => {
    const bad = { rowCounts: {}, data: { project: [] } };
    expect(() => verifyBackupContents(JSON.stringify(bad))).toThrow(/missing top-level key "meta"/);
  });

  it("rejects when top-level rowCounts key is missing", () => {
    const bad = { meta: { tenantId: "t_1" }, data: { project: [] } };
    expect(() => verifyBackupContents(JSON.stringify(bad))).toThrow(/missing top-level key "rowCounts"/);
  });

  it("rejects when top-level data key is missing", () => {
    const bad = { meta: { tenantId: "t_1" }, rowCounts: {} };
    expect(() => verifyBackupContents(JSON.stringify(bad))).toThrow(/missing top-level key "data"/);
  });

  it("rejects when data is empty object", () => {
    const bad = { meta: { tenantId: "t_1" }, rowCounts: {}, data: {} };
    expect(() => verifyBackupContents(JSON.stringify(bad))).toThrow(/data section is empty/);
  });

  it("rejects when data is null", () => {
    const bad = { meta: { tenantId: "t_1" }, rowCounts: {}, data: null };
    expect(() => verifyBackupContents(JSON.stringify(bad))).toThrow(/data section is empty/);
  });
});
