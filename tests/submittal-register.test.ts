import { describe, it, expect } from "vitest";
import {
  ballInCourtFor,
  daysBetween,
  toRegisterRow,
  buildSubmittalRegister,
  COURT_SLA_DAYS,
  type SubmittalLike,
} from "../src/lib/submittal-register";

const NOW = new Date("2026-06-05T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function sub(partial: Partial<SubmittalLike> & { id: string; status: string }): SubmittalLike {
  return {
    number: partial.number ?? "SUB-001",
    title: partial.title ?? "Test submittal",
    specSection: partial.specSection ?? null,
    longLead: partial.longLead ?? false,
    resubmittalCount: partial.resubmittalCount ?? 0,
    currentReviewerEmail: partial.currentReviewerEmail ?? null,
    sentToReviewerAt: partial.sentToReviewerAt ?? null,
    submittedAt: partial.submittedAt ?? null,
    approvedAt: partial.approvedAt ?? null,
    rejectedAt: partial.rejectedAt ?? null,
    createdAt: partial.createdAt ?? daysAgo(30),
    updatedAt: partial.updatedAt ?? daysAgo(30),
    ...partial,
  };
}

describe("submittal-register — ball in court", () => {
  it("maps status to the responsible court", () => {
    expect(ballInCourtFor("APPROVED")).toBe("CLOSED");
    expect(ballInCourtFor("UNDER_REVIEW")).toBe("REVIEWER");
    expect(ballInCourtFor("SUBMITTED")).toBe("REVIEWER");
    expect(ballInCourtFor("DRAFT")).toBe("CONTRACTOR");
    expect(ballInCourtFor("REJECTED")).toBe("CONTRACTOR");
  });
});

describe("submittal-register — daysBetween", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysBetween(daysAgo(5), NOW)).toBe(5);
    expect(daysBetween(NOW, daysAgo(5))).toBe(0); // future = 0
    expect(daysBetween(NOW, NOW)).toBe(0);
  });
});

describe("submittal-register — row aging", () => {
  it("reviewer-held row ages from sentToReviewerAt and goes overdue past SLA", () => {
    const row = toRegisterRow(
      sub({ id: "1", status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(COURT_SLA_DAYS.REVIEWER + 3), currentReviewerEmail: "arch@x.com" }),
      NOW,
    );
    expect(row.ballInCourt).toBe("REVIEWER");
    expect(row.responsibleParty).toBe("arch@x.com");
    expect(row.daysInCourt).toBe(COURT_SLA_DAYS.REVIEWER + 3);
    expect(row.overdue).toBe(true);
  });

  it("reviewer-held within SLA is not overdue and falls back to 'Design team'", () => {
    const row = toRegisterRow(sub({ id: "2", status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(3) }), NOW);
    expect(row.responsibleParty).toBe("Design team");
    expect(row.overdue).toBe(false);
  });

  it("contractor-held row ages from updatedAt", () => {
    const row = toRegisterRow(sub({ id: "3", status: "REJECTED", updatedAt: daysAgo(20) }), NOW);
    expect(row.ballInCourt).toBe("CONTRACTOR");
    expect(row.responsibleParty).toBe("Contractor");
    expect(row.daysInCourt).toBe(20);
    expect(row.overdue).toBe(true);
  });

  it("closed (approved) row has zero days and is never overdue", () => {
    const row = toRegisterRow(sub({ id: "4", status: "APPROVED", approvedAt: daysAgo(100) }), NOW);
    expect(row.ballInCourt).toBe("CLOSED");
    expect(row.daysInCourt).toBe(0);
    expect(row.overdue).toBe(false);
  });
});

describe("submittal-register — roll-up", () => {
  it("summarizes courts, overdue count, and sorts overdue-first", () => {
    const { rows, summary } = buildSubmittalRegister(
      [
        sub({ id: "ok", status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(2) }),
        sub({ id: "late", status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(40), longLead: true }),
        sub({ id: "done", status: "APPROVED", approvedAt: daysAgo(10) }),
        sub({ id: "ours", status: "DRAFT", updatedAt: daysAgo(1) }),
      ],
      NOW,
    );
    expect(summary.total).toBe(4);
    expect(summary.open).toBe(3);
    expect(summary.withReviewer).toBe(2);
    expect(summary.withContractor).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(summary.longLeadOpen).toBe(1);
    // overdue 'late' sorts to the top
    expect(rows[0].id).toBe("late");
  });

  it("avgDaysOpen is 0 when nothing is open", () => {
    const { summary } = buildSubmittalRegister([sub({ id: "x", status: "APPROVED", approvedAt: daysAgo(5) })], NOW);
    expect(summary.avgDaysOpen).toBe(0);
  });
});
