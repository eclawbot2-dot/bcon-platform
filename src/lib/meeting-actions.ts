/**
 * Meeting action-item roll-up — pure functions, no Prisma.
 *
 * Meeting minutes are only as useful as the follow-through. This module
 * turns a project's action items into the "what's open, who owes it, and
 * what's overdue" register that keeps commitments from evaporating between
 * meetings. Everything is computed against a caller-supplied `now` so it is
 * deterministic in tests.
 */

export type MeetingActionStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

/** A status that still owes work (counts toward the open register). */
export function isOpenStatus(status: string): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export type ActionItemLike = {
  id: string;
  description: string;
  assignee: string | null;
  dueDate: Date | null;
  status: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date;
};

export type ActionItemRow = ActionItemLike & {
  open: boolean;
  overdue: boolean;
  daysUntilDue: number | null;
};

export type ActionItemSummary = {
  total: number;
  open: number;
  overdue: number;
  done: number;
  cancelled: number;
  /** Open items per assignee, worst-first (most overdue, then most open). */
  byAssignee: { assignee: string; open: number; overdue: number }[];
};

export type ActionItemRegister = {
  items: ActionItemRow[];
  summary: ActionItemSummary;
};

/** Whole-day difference (b - a), floored. Negative when b precedes a. */
function dayDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Build the action-item register: each row flagged open/overdue with days
 * until due, sorted overdue-first then soonest-due, plus per-assignee and
 * status roll-ups. An item is overdue only when it is still open AND its
 * due date is strictly in the past.
 */
export function buildActionItemRegister(
  items: ActionItemLike[],
  now: Date = new Date(),
): ActionItemRegister {
  const rows: ActionItemRow[] = items.map((it) => {
    const open = isOpenStatus(it.status);
    const daysUntilDue = it.dueDate ? dayDiff(now, it.dueDate) : null;
    const overdue = open && it.dueDate != null && it.dueDate.getTime() < now.getTime();
    return { ...it, open, overdue, daysUntilDue };
  });

  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    // Open before closed.
    if (a.open !== b.open) return a.open ? -1 : 1;
    // Soonest due first; null due dates last.
    const ad = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return b.meetingDate.getTime() - a.meetingDate.getTime();
  });

  const byAssigneeMap = new Map<string, { assignee: string; open: number; overdue: number }>();
  for (const r of rows) {
    if (!r.open) continue;
    const key = r.assignee?.trim() || "Unassigned";
    const agg = byAssigneeMap.get(key) ?? { assignee: key, open: 0, overdue: 0 };
    agg.open += 1;
    if (r.overdue) agg.overdue += 1;
    byAssigneeMap.set(key, agg);
  }
  const byAssignee = Array.from(byAssigneeMap.values()).sort(
    (a, b) => b.overdue - a.overdue || b.open - a.open || a.assignee.localeCompare(b.assignee),
  );

  const summary: ActionItemSummary = {
    total: rows.length,
    open: rows.filter((r) => r.open).length,
    overdue: rows.filter((r) => r.overdue).length,
    done: rows.filter((r) => r.status === "DONE").length,
    cancelled: rows.filter((r) => r.status === "CANCELLED").length,
    byAssignee,
  };

  return { items: rows, summary };
}
