/**
 * Portfolio-wide "ball-in-court" aging — pure functions, no Prisma.
 *
 * Ball-in-court is the party that currently owes the next action on an open
 * item. The single most-asked executive question on a construction program
 * is "what's stuck, with whom, and for how long?" — RFIs waiting on the
 * design team and submittals sitting in review are the classic schedule
 * killers. This module rolls RFIs *and* submittals across every project in a
 * tenant into one aging view: per-item rows plus bucketed / by-party
 * roll-ups for the dashboard.
 *
 * It deliberately reuses the submittal court/aging primitives in
 * submittal-register.ts so the two surfaces never diverge, and computes
 * everything against a caller-supplied `now` so it is deterministic in tests.
 */

import {
  daysBetween,
  toRegisterRow,
  type SubmittalLike,
} from "./submittal-register";

export type BicType = "RFI" | "SUBMITTAL";

/** Court that holds an open item. CLOSED items are excluded from the view. */
export type BicCourt = "CONTRACTOR" | "REVIEWER";

/** Days-in-court aging buckets, low→high. */
export type AgingBucketKey = "0-7" | "8-14" | "15-30" | "31+";
export const AGING_BUCKETS: readonly AgingBucketKey[] = ["0-7", "8-14", "15-30", "31+"] as const;

/** SLA (days) before an open item is flagged overdue purely on age. RFIs and
 *  submittals both run a two-week clock; a per-item due date (RFIs) overrides
 *  this when earlier. */
export const BIC_SLA_DAYS = 14;

export function agingBucket(days: number): AgingBucketKey {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return "31+";
}

/** Minimal RFI shape the aging view needs (plus the owning project label). */
export type RfiLike = {
  id: string;
  number: string;
  subject: string;
  status: string; // WorkflowStatus
  projectId: string;
  projectName: string;
  dueDate: Date | null;
  ballInCourt: string | null;
  currentReviewerEmail: string | null;
  sentToReviewerAt: Date | null;
  submittedAt: Date | null;
  respondedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A submittal plus the owning project label. */
export type SubmittalWithProject = SubmittalLike & { projectId: string; projectName: string };

export type BicOpenItem = {
  id: string;
  type: BicType;
  number: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  court: BicCourt;
  responsibleParty: string;
  daysInCourt: number;
  bucket: AgingBucketKey;
  dueDate: Date | null;
  overdue: boolean;
};

/**
 * Resolve an RFI into its open ball-in-court row, or null when the RFI is
 * not open (approved / closed).
 *
 * RFI lifecycle (see src/lib/record-actions.ts):
 *   DRAFT        → contractor/originator owes a submit
 *   UNDER_REVIEW → with the reviewer until a response lands; once
 *                  `respondedAt` is set the ball returns to the PM to close
 *   APPROVED / CLOSED → done (excluded)
 *   REJECTED     → back with the contractor to revise/resubmit
 */
export function rfiToOpenItem(r: RfiLike, now: Date): BicOpenItem | null {
  const status = r.status;
  if (status === "APPROVED" || status === "CLOSED") return null;

  let court: BicCourt;
  let since: Date;
  let responsibleParty: string;

  if (status === "UNDER_REVIEW" && !r.respondedAt) {
    court = "REVIEWER";
    since = r.sentToReviewerAt ?? r.submittedAt ?? r.createdAt;
    responsibleParty = r.currentReviewerEmail ?? r.ballInCourt ?? "Design team";
  } else if (status === "UNDER_REVIEW" && r.respondedAt) {
    // Responded but not yet closed — PM owes the close-out.
    court = "CONTRACTOR";
    since = r.respondedAt;
    responsibleParty = r.ballInCourt ?? "PM / originator";
  } else if (status === "REJECTED") {
    court = "CONTRACTOR";
    since = r.rejectedAt ?? r.updatedAt;
    responsibleParty = r.ballInCourt ?? "Contractor";
  } else {
    // DRAFT or any other pre-submission state.
    court = "CONTRACTOR";
    since = r.createdAt;
    responsibleParty = r.ballInCourt ?? "Contractor";
  }

  const daysInCourt = daysBetween(since, now);
  const pastDue = r.dueDate != null && now.getTime() > r.dueDate.getTime();
  return {
    id: r.id,
    type: "RFI",
    number: r.number,
    title: r.subject,
    projectId: r.projectId,
    projectName: r.projectName,
    status,
    court,
    responsibleParty,
    daysInCourt,
    bucket: agingBucket(daysInCourt),
    dueDate: r.dueDate,
    overdue: pastDue || daysInCourt > BIC_SLA_DAYS,
  };
}

/** Resolve a submittal into its open ball-in-court row, or null when closed. */
export function submittalToOpenItem(s: SubmittalWithProject, now: Date): BicOpenItem | null {
  const row = toRegisterRow(s, now);
  if (row.ballInCourt === "CLOSED") return null;
  return {
    id: row.id,
    type: "SUBMITTAL",
    number: row.number,
    title: row.title,
    projectId: s.projectId,
    projectName: s.projectName,
    status: row.status,
    court: row.ballInCourt, // CONTRACTOR | REVIEWER (CLOSED filtered above)
    responsibleParty: row.responsibleParty,
    daysInCourt: row.daysInCourt,
    bucket: agingBucket(row.daysInCourt),
    dueDate: null,
    overdue: row.overdue,
  };
}

export type BicPartyRow = {
  party: string;
  open: number;
  overdue: number;
  maxDays: number;
};

export type BicSummary = {
  totalOpen: number;
  overdue: number;
  withReviewer: number;
  withContractor: number;
  avgDaysOpen: number;
  oldestDays: number;
  byBucket: Record<AgingBucketKey, number>;
  /** Responsible parties holding the most open items, worst-first. */
  byParty: BicPartyRow[];
};

export type BallInCourtAging = {
  items: BicOpenItem[];
  summary: BicSummary;
};

/**
 * Build the combined RFI + submittal aging view: rows sorted overdue-first
 * then oldest-first, plus bucket / party roll-ups for the dashboard tiles.
 */
export function buildBallInCourtAging(
  input: { rfis: RfiLike[]; submittals: SubmittalWithProject[] },
  now: Date = new Date(),
): BallInCourtAging {
  const items: BicOpenItem[] = [];
  for (const r of input.rfis) {
    const item = rfiToOpenItem(r, now);
    if (item) items.push(item);
  }
  for (const s of input.submittals) {
    const item = submittalToOpenItem(s, now);
    if (item) items.push(item);
  }

  items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.daysInCourt - a.daysInCourt;
  });

  const byBucket: Record<AgingBucketKey, number> = { "0-7": 0, "8-14": 0, "15-30": 0, "31+": 0 };
  for (const it of items) byBucket[it.bucket] += 1;

  const partyMap = new Map<string, BicPartyRow>();
  for (const it of items) {
    const row = partyMap.get(it.responsibleParty) ?? { party: it.responsibleParty, open: 0, overdue: 0, maxDays: 0 };
    row.open += 1;
    if (it.overdue) row.overdue += 1;
    if (it.daysInCourt > row.maxDays) row.maxDays = it.daysInCourt;
    partyMap.set(it.responsibleParty, row);
  }
  const byParty = Array.from(partyMap.values()).sort(
    (a, b) => b.overdue - a.overdue || b.open - a.open || b.maxDays - a.maxDays,
  );

  const totalDays = items.reduce((sum, it) => sum + it.daysInCourt, 0);
  const summary: BicSummary = {
    totalOpen: items.length,
    overdue: items.filter((it) => it.overdue).length,
    withReviewer: items.filter((it) => it.court === "REVIEWER").length,
    withContractor: items.filter((it) => it.court === "CONTRACTOR").length,
    avgDaysOpen: items.length > 0 ? Math.round(totalDays / items.length) : 0,
    oldestDays: items.reduce((max, it) => Math.max(max, it.daysInCourt), 0),
    byBucket,
    byParty,
  };

  return { items, summary };
}
