import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route tests for POST /api/projects/[projectId]/daily-logs/create.
 *
 * This route is the field superintendent's only way to record a daily
 * report — until it landed, the ONLY writer of DailyLog rows was the
 * weather-capture cron, so the daily-logs page advertised "once the
 * superintendent starts logging" with no input. These tests pin the
 * security + correctness contract with tenant / permissions / prisma
 * mocked (same approach as file-route-isolation.test.ts):
 *
 *   - non-editor                  -> redirect with error, NO create
 *   - missing summary             -> redirect with error, NO create
 *   - valid submit                -> dailyLog.create with coerced fields
 *   - garbage manpower            -> coerced to 0 (never NaN)
 *   - invalid logType             -> falls back to GENERAL
 *   - half-filled geotag          -> coordinates dropped
 *   - recent identical summary    -> deduped, NO second create
 */

const requireTenantMock = vi.fn();
const requireEditorMock = vi.fn();
const dailyLogCreate = vi.fn();
const dailyLogFindFirst = vi.fn();
const projectFindFirst = vi.fn();
const auditCreate = vi.fn();

vi.mock("@/lib/tenant", () => ({ requireTenant: () => requireTenantMock() }));
vi.mock("@/lib/permissions", () => ({ requireEditor: (id: string) => requireEditorMock(id) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: (a: unknown) => projectFindFirst(a) },
    dailyLog: { create: (a: unknown) => dailyLogCreate(a), findFirst: (a: unknown) => dailyLogFindFirst(a) },
    auditEvent: { create: (a: unknown) => auditCreate(a) },
  },
}));

import { POST } from "@/app/api/projects/[projectId]/daily-logs/create/route";

function req(fields: Record<string, string>) {
  const form = new Map<string, string>(Object.entries(fields));
  return {
    headers: { get: () => "bcon.jahdev.com" },
    url: "https://bcon.jahdev.com/api/projects/p1/daily-logs/create",
    formData: async () => ({ get: (k: string) => (form.has(k) ? form.get(k)! : null) }),
  } as unknown as Parameters<typeof POST>[0];
}
const ctx = { params: Promise.resolve({ projectId: "p1" }) } as Parameters<typeof POST>[1];

beforeEach(() => {
  requireTenantMock.mockReset().mockResolvedValue({ id: "t1" });
  requireEditorMock.mockReset().mockResolvedValue({ userId: "u1", userName: "Sam Super" });
  projectFindFirst.mockReset().mockResolvedValue({ id: "p1", tenantId: "t1" });
  dailyLogFindFirst.mockReset().mockResolvedValue(null);
  dailyLogCreate.mockReset().mockResolvedValue({ id: "log1", logDate: new Date(), logType: "GENERAL", manpower: 0 });
  auditCreate.mockReset().mockResolvedValue({});
});

describe("POST /api/projects/[id]/daily-logs/create", () => {
  it("blocks non-editors and never writes", async () => {
    requireEditorMock.mockRejectedValue(new Error("Editor-level role required."));
    const res = await POST(req({ summary: "poured slab" }), ctx);
    expect(res.status).toBe(303);
    expect(decodeURIComponent(res.headers.get("location")!)).toMatch(/error=.*Editor/);
    expect(dailyLogCreate).not.toHaveBeenCalled();
  });

  it("requires a summary", async () => {
    const res = await POST(req({ summary: "   " }), ctx);
    expect(res.status).toBe(303);
    expect(decodeURIComponent(res.headers.get("location")!)).toMatch(/error=.*summary is required/);
    expect(dailyLogCreate).not.toHaveBeenCalled();
  });

  it("404-redirects when the project is not in the caller's tenant", async () => {
    projectFindFirst.mockResolvedValue(null);
    const res = await POST(req({ summary: "x" }), ctx);
    expect(res.status).toBe(303);
    expect(dailyLogCreate).not.toHaveBeenCalled();
  });

  it("creates a log with coerced fields + writes an audit event", async () => {
    const res = await POST(
      req({ summary: "Poured slab", logDate: "2026-06-01", logType: "AREA", manpower: "12", weather: "clear", segment: "A2", station: "STA 1+00" }),
      ctx,
    );
    expect(res.status).toBe(303);
    expect(dailyLogCreate).toHaveBeenCalledTimes(1);
    const data = dailyLogCreate.mock.calls[0][0].data;
    expect(data.projectId).toBe("p1");
    expect(data.summary).toBe("Poured slab");
    expect(data.logType).toBe("AREA");
    expect(data.manpower).toBe(12);
    expect(data.weather).toBe("clear");
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data.entityType).toBe("DailyLog");
  });

  it("coerces garbage manpower to 0 (never NaN/negative)", async () => {
    await POST(req({ summary: "x", manpower: "abc" }), ctx);
    expect(dailyLogCreate.mock.calls[0][0].data.manpower).toBe(0);
    dailyLogCreate.mockClear();
    await POST(req({ summary: "y", manpower: "-5" }), ctx);
    expect(dailyLogCreate.mock.calls[0][0].data.manpower).toBe(0);
  });

  it("falls back to GENERAL for an unknown logType", async () => {
    await POST(req({ summary: "x", logType: "NONSENSE" }), ctx);
    expect(dailyLogCreate.mock.calls[0][0].data.logType).toBe("GENERAL");
  });

  it("drops a half-filled geotag but keeps a valid pair", async () => {
    await POST(req({ summary: "x", latitude: "40.1" }), ctx); // lon missing
    expect(dailyLogCreate.mock.calls[0][0].data.latitude).toBeUndefined();
    expect(dailyLogCreate.mock.calls[0][0].data.longitude).toBeUndefined();
    dailyLogCreate.mockClear();
    await POST(req({ summary: "y", latitude: "40.1", longitude: "-105.2" }), ctx);
    expect(dailyLogCreate.mock.calls[0][0].data.latitude).toBe(40.1);
    expect(dailyLogCreate.mock.calls[0][0].data.longitude).toBe(-105.2);
    dailyLogCreate.mockClear();
    await POST(req({ summary: "z", latitude: "999", longitude: "-105.2" }), ctx); // out of range
    expect(dailyLogCreate.mock.calls[0][0].data.latitude).toBeUndefined();
  });

  it("dedups an identical summary posted within 30s (no second write)", async () => {
    dailyLogFindFirst.mockResolvedValue({ id: "existing" });
    const res = await POST(req({ summary: "Poured slab" }), ctx);
    expect(res.status).toBe(303);
    expect(decodeURIComponent(res.headers.get("location")!)).toMatch(/ok=/);
    expect(dailyLogCreate).not.toHaveBeenCalled();
  });
});
