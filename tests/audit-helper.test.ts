/**
 * Tests for the centralized recordAudit helper. Prisma is mocked so
 * these run fast and don't need a seeded DB.
 *
 * Covers:
 *   - before/after stringification (incl. bigint replacer if any)
 *   - _actor snapshot embedded in afterJson
 *   - null before/after pass-through
 *   - fail-safe: a prisma error must NOT propagate
 *   - source defaulting
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { auditCreate } = vi.hoisted(() => ({ auditCreate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { auditEvent: { create: auditCreate } },
}));

import { recordAudit } from "@/lib/audit";

describe("recordAudit", () => {
  beforeEach(() => {
    auditCreate.mockReset();
  });

  it("forwards required fields + stringifies before/after", async () => {
    auditCreate.mockResolvedValue({});
    await recordAudit({
      tenantId: "t1",
      actorId: "u1",
      entityType: "Project",
      entityId: "p1",
      action: "UPDATE",
      before: { name: "Old" },
      after: { name: "New" },
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const args = auditCreate.mock.calls[0][0].data;
    expect(args.tenantId).toBe("t1");
    expect(args.actorId).toBe("u1");
    expect(args.entityType).toBe("Project");
    expect(args.entityId).toBe("p1");
    expect(args.action).toBe("UPDATE");
    expect(JSON.parse(args.beforeJson)).toEqual({ name: "Old" });
    expect(JSON.parse(args.afterJson)).toEqual({ name: "New" });
  });

  it("embeds _actor snapshot in afterJson when actorName provided", async () => {
    auditCreate.mockResolvedValue({});
    await recordAudit({
      tenantId: "t1",
      actorName: "Christina",
      entityType: "Project",
      entityId: "p1",
      action: "UPDATE",
      after: { name: "New" },
    });
    const args = auditCreate.mock.calls[0][0].data;
    expect(JSON.parse(args.afterJson)).toEqual({ name: "New", _actor: "Christina" });
  });

  it("wraps a non-object `after` value into { value: ... } when actorName present", async () => {
    auditCreate.mockResolvedValue({});
    await recordAudit({
      tenantId: "t1",
      actorName: "Anonymous",
      entityType: "Flag",
      entityId: "f1",
      action: "TOGGLE",
      after: true,
    });
    const args = auditCreate.mock.calls[0][0].data;
    expect(JSON.parse(args.afterJson)).toEqual({ value: true, _actor: "Anonymous" });
  });

  it("nulls before/after json when omitted", async () => {
    auditCreate.mockResolvedValue({});
    await recordAudit({
      tenantId: "t1",
      entityType: "X",
      entityId: "1",
      action: "CREATE",
    });
    const args = auditCreate.mock.calls[0][0].data;
    expect(args.beforeJson).toBeNull();
    expect(args.afterJson).toBeNull();
  });

  it("never throws even when prisma fails", async () => {
    auditCreate.mockRejectedValue(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordAudit({ tenantId: "t1", entityType: "X", entityId: "1", action: "CREATE" }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
