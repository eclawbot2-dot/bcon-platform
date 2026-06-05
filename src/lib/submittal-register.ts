/**
 * Submittal register + ball-in-court aging — pure functions, no Prisma.
 *
 * "Ball in court" is the party who currently owns the next action on a
 * submittal. A submittal that sits in one court too long is what blows
 * procurement schedules, so the register surfaces days-in-court and flags
 * overdue items. The page fetches submittals and hands the minimal shape
 * here; aging is computed against a caller-supplied `now` so it's
 * deterministic in tests.
 */

export type SubmittalLike = {
  id: string;
  number: string;
  title: string;
  specSection: string | null;
  status: string; // WorkflowStatus
  longLead: boolean;
  resubmittalCount: number;
  currentReviewerEmail: string | null;
  sentToReviewerAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BallInCourt = "CONTRACTOR" | "REVIEWER" | "CLOSED";

export type SubmittalRegisterRow = {
  id: string;
  number: string;
  title: string;
  specSection: string | null;
  status: string;
  longLead: boolean;
  resubmittalCount: number;
  ballInCourt: BallInCourt;
  /** Human label for who holds the ball (reviewer email when known). */
  responsibleParty: string;
  /** When the current court took possession (drives aging). */
  inCourtSince: Date;
  /** Whole days the item has sat in the current court. */
  daysInCourt: number;
  /** True once daysInCourt exceeds the SLA for the current court. */
  overdue: boolean;
};

/**
 * SLA (days) before an item is flagged overdue, by court. Long-lead
 * reviews and contractor turnaround both run on a 2-week clock here;
 * tune per spec. Closed items never go overdue.
 */
export const COURT_SLA_DAYS: Record<BallInCourt, number> = {
  CONTRACTOR: 14,
  REVIEWER: 14,
  CLOSED: Infinity,
};

/** Whole calendar days between two instants (never negative). */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Resolve who holds the ball:
 *  - APPROVED  → CLOSED (no further action)
 *  - UNDER_REVIEW / SUBMITTED → REVIEWER (waiting on the reviewer/design team)
 *  - DRAFT / REJECTED / anything else → CONTRACTOR (we owe the next move)
 */
export function ballInCourtFor(status: string): BallInCourt {
  switch (status) {
    case "APPROVED":
      return "CLOSED";
    case "UNDER_REVIEW":
    case "SUBMITTED":
      return "REVIEWER";
    default:
      return "CONTRACTOR";
  }
}

/**
 * The instant the current court took possession. For a review, that's
 * when it was sent to the reviewer (falling back to submittedAt, then
 * updatedAt). For contractor-held items it's updatedAt (the last status
 * change). Closed items are dated at approval.
 */
function inCourtSince(s: SubmittalLike, court: BallInCourt): Date {
  if (court === "CLOSED") return s.approvedAt ?? s.updatedAt;
  if (court === "REVIEWER") return s.sentToReviewerAt ?? s.submittedAt ?? s.updatedAt;
  return s.updatedAt;
}

export function toRegisterRow(s: SubmittalLike, now: Date = new Date()): SubmittalRegisterRow {
  const court = ballInCourtFor(s.status);
  const since = inCourtSince(s, court);
  const days = court === "CLOSED" ? 0 : daysBetween(since, now);
  const responsibleParty =
    court === "CLOSED"
      ? "Closed"
      : court === "REVIEWER"
        ? s.currentReviewerEmail ?? "Design team"
        : "Contractor";
  return {
    id: s.id,
    number: s.number,
    title: s.title,
    specSection: s.specSection,
    status: s.status,
    longLead: s.longLead,
    resubmittalCount: s.resubmittalCount,
    ballInCourt: court,
    responsibleParty,
    inCourtSince: since,
    daysInCourt: days,
    overdue: days > COURT_SLA_DAYS[court],
  };
}

export type SubmittalRegisterSummary = {
  total: number;
  open: number;
  withReviewer: number;
  withContractor: number;
  overdue: number;
  longLeadOpen: number;
  /** Average days-in-court across open items (0 when none open). */
  avgDaysOpen: number;
};

/**
 * Build the full register (rows sorted overdue-first, then oldest first)
 * plus a roll-up summary for the dashboard tiles.
 */
export function buildSubmittalRegister(
  submittals: SubmittalLike[],
  now: Date = new Date(),
): { rows: SubmittalRegisterRow[]; summary: SubmittalRegisterSummary } {
  const rows = submittals.map((s) => toRegisterRow(s, now));
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.daysInCourt - a.daysInCourt;
  });

  const open = rows.filter((r) => r.ballInCourt !== "CLOSED");
  const summary: SubmittalRegisterSummary = {
    total: rows.length,
    open: open.length,
    withReviewer: rows.filter((r) => r.ballInCourt === "REVIEWER").length,
    withContractor: rows.filter((r) => r.ballInCourt === "CONTRACTOR").length,
    overdue: rows.filter((r) => r.overdue).length,
    longLeadOpen: open.filter((r) => r.longLead).length,
    avgDaysOpen: open.length > 0 ? Math.round(open.reduce((sum, r) => sum + r.daysInCourt, 0) / open.length) : 0,
  };
  return { rows, summary };
}
