import { describe, it, expect } from "vitest";
import { buildActionItemRegister, isOpenStatus, type ActionItemLike } from "../src/lib/meeting-actions";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function item(over: Partial<ActionItemLike> & { id: string }): ActionItemLike {
  return {
    id: over.id,
    description: over.description ?? "do a thing",
    assignee: over.assignee ?? null,
    dueDate: over.dueDate ?? null,
    status: over.status ?? "OPEN",
    meetingId: over.meetingId ?? "m1",
    meetingTitle: over.meetingTitle ?? "OAC #1",
    meetingDate: over.meetingDate ?? new Date("2026-06-01T00:00:00.000Z"),
  };
}

describe("isOpenStatus", () => {
  it("treats OPEN and IN_PROGRESS as open; DONE/CANCELLED as closed", () => {
    expect(isOpenStatus("OPEN")).toBe(true);
    expect(isOpenStatus("IN_PROGRESS")).toBe(true);
    expect(isOpenStatus("DONE")).toBe(false);
    expect(isOpenStatus("CANCELLED")).toBe(false);
  });
});

describe("buildActionItemRegister", () => {
  it("flags overdue only for open items with a past due date", () => {
    const reg = buildActionItemRegister(
      [
        item({ id: "a", status: "OPEN", dueDate: new Date("2026-06-10T00:00:00Z") }), // past + open -> overdue
        item({ id: "b", status: "DONE", dueDate: new Date("2026-06-10T00:00:00Z") }), // past but done -> not overdue
        item({ id: "c", status: "OPEN", dueDate: new Date("2026-06-20T00:00:00Z") }), // future -> not overdue
        item({ id: "d", status: "OPEN", dueDate: null }), // no due date -> not overdue
      ],
      NOW,
    );
    const byId = Object.fromEntries(reg.items.map((r) => [r.id, r]));
    expect(byId.a.overdue).toBe(true);
    expect(byId.b.overdue).toBe(false);
    expect(byId.c.overdue).toBe(false);
    expect(byId.d.overdue).toBe(false);
  });

  it("summarizes open / overdue / done / cancelled counts", () => {
    const { summary } = buildActionItemRegister(
      [
        item({ id: "a", status: "OPEN", dueDate: new Date("2026-06-10T00:00:00Z") }),
        item({ id: "b", status: "IN_PROGRESS" }),
        item({ id: "c", status: "DONE" }),
        item({ id: "d", status: "CANCELLED" }),
      ],
      NOW,
    );
    expect(summary.total).toBe(4);
    expect(summary.open).toBe(2); // OPEN + IN_PROGRESS
    expect(summary.overdue).toBe(1);
    expect(summary.done).toBe(1);
    expect(summary.cancelled).toBe(1);
  });

  it("sorts overdue first, then soonest due", () => {
    const { items } = buildActionItemRegister(
      [
        item({ id: "future", status: "OPEN", dueDate: new Date("2026-06-20T00:00:00Z") }),
        item({ id: "overdue", status: "OPEN", dueDate: new Date("2026-06-05T00:00:00Z") }),
        item({ id: "done", status: "DONE", dueDate: new Date("2026-06-01T00:00:00Z") }),
      ],
      NOW,
    );
    expect(items[0].id).toBe("overdue");
    expect(items[1].id).toBe("future");
    expect(items[2].id).toBe("done");
  });

  it("groups open items by assignee with Unassigned fallback, worst-first", () => {
    const { summary } = buildActionItemRegister(
      [
        item({ id: "1", assignee: "Sam", status: "OPEN", dueDate: new Date("2026-06-01T00:00:00Z") }), // overdue
        item({ id: "2", assignee: "Sam", status: "OPEN" }),
        item({ id: "3", assignee: null, status: "OPEN" }),
        item({ id: "4", assignee: "Pat", status: "DONE" }), // closed -> excluded from byAssignee
      ],
      NOW,
    );
    expect(summary.byAssignee[0]).toEqual({ assignee: "Sam", open: 2, overdue: 1 });
    const unassigned = summary.byAssignee.find((a) => a.assignee === "Unassigned");
    expect(unassigned).toEqual({ assignee: "Unassigned", open: 1, overdue: 0 });
    expect(summary.byAssignee.find((a) => a.assignee === "Pat")).toBeUndefined();
  });
});
