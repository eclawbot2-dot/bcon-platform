/**
 * Tests for the JSON-column safe-parse helpers. Architecture audit
 * flagged ~26 bare JSON.parse() callsites as a silent-corruption
 * vector; the schema-validated parser is the fix. These tests
 * guarantee the parse-or-fallback contract holds.
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  safeParseJson,
  enabledModesSchema,
  scoreSignalSchema,
  scoreExplanationSchema,
  parseStringList,
  parseStringRecord,
} from "@/lib/json-schema";

describe("safeParseJson", () => {
  it("returns fallback for null/undefined/empty input without warning", () => {
    expect(safeParseJson(null, z.string(), "fallback")).toBe("fallback");
    expect(safeParseJson(undefined, z.string(), "fallback")).toBe("fallback");
    expect(safeParseJson("", z.string(), "fallback")).toBe("fallback");
  });

  it("returns parsed value for valid JSON matching the schema", () => {
    const v = safeParseJson('"hello"', z.string(), "fallback");
    expect(v).toBe("hello");
  });

  it("returns fallback when JSON parses but fails schema validation", () => {
    const v = safeParseJson("42", z.string(), "fallback");
    expect(v).toBe("fallback");
  });

  it("returns fallback when JSON itself doesn't parse", () => {
    const v = safeParseJson("{not json", z.string(), "fallback");
    expect(v).toBe("fallback");
  });

  it("returns the schema-typed value for arrays + objects", () => {
    expect(safeParseJson<string[]>('["a","b"]', z.array(z.string()), [])).toEqual(["a", "b"]);
    expect(safeParseJson<Record<string, unknown>>('{"k":1}', z.record(z.string(), z.unknown()), {})).toEqual({ k: 1 });
  });
});

describe("enabledModesSchema", () => {
  it("accepts a valid mode list", () => {
    const r = enabledModesSchema.safeParse(["SIMPLE", "VERTICAL"]);
    expect(r.success).toBe(true);
  });

  it("rejects unknown modes", () => {
    const r = enabledModesSchema.safeParse(["SIMPLE", "BOGUS"]);
    expect(r.success).toBe(false);
  });

  it("rejects non-array input", () => {
    const r = enabledModesSchema.safeParse("SIMPLE");
    expect(r.success).toBe(false);
  });
});

describe("scoreSignalSchema + scoreExplanationSchema", () => {
  it("accepts valid signal", () => {
    const r = scoreSignalSchema.safeParse({ name: "naics", weight: 1, fit: 0.8 });
    expect(r.success).toBe(true);
  });

  it("accepts signal with optional note", () => {
    const r = scoreSignalSchema.safeParse({ name: "geo", weight: 1, fit: 0.5, note: "in-state" });
    expect(r.success).toBe(true);
  });

  it("rejects signal missing required fields", () => {
    expect(scoreSignalSchema.safeParse({ weight: 1, fit: 0.5 }).success).toBe(false);
    expect(scoreSignalSchema.safeParse({ name: "x", fit: 0.5 }).success).toBe(false);
  });

  it("accepts array of signals", () => {
    const r = scoreExplanationSchema.safeParse([{ name: "a", weight: 1, fit: 1 }]);
    expect(r.success).toBe(true);
  });
});

describe("parseStringList", () => {
  it("returns [] for null", () => {
    expect(parseStringList(null)).toEqual([]);
  });

  it("returns the parsed list", () => {
    expect(parseStringList('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("returns [] when JSON is not a string array", () => {
    expect(parseStringList('[1,2,3]')).toEqual([]);
    expect(parseStringList('"a"')).toEqual([]);
  });
});

describe("parseStringRecord", () => {
  it("returns {} for null", () => {
    expect(parseStringRecord(null)).toEqual({});
  });

  it("returns the parsed map", () => {
    expect(parseStringRecord('{"k":"v"}')).toEqual({ k: "v" });
  });

  it("returns {} when JSON is not an object", () => {
    expect(parseStringRecord('["a","b"]')).toEqual({});
    expect(parseStringRecord("null")).toEqual({});
  });

  it("returns {} for malformed JSON without throwing", () => {
    expect(parseStringRecord("{not json")).toEqual({});
  });
});
