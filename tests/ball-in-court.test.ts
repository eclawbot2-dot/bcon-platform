import { describe, it, expect } from "vitest";
import {
  agingBucket,
  rfiToOpenItem,
  submittalToOpenItem,
  buildBallInCourtAging,
  AGING_BUCKETS,
  type RfiLike,
  type SubmittalWithProject,
} from "../src/lib/ball-in-court";

const NOW = new Date("2026-06-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function rfi(overrides: Partial<RfiLike>): RfiLike {
  return {
    id: "r1",
    number: "RFI-001",
    subject: "Beam clash",
    status: "UNDER_REVIEW",
    projectId: "p1",
    projectName: "Tower A",
    dueDate: null,
    ballInCourt: null,
    currentReviewerEmail: null,
    sentToReviewerAt: null,
    submittedAt: null,
    respondedAt: null,
    rejectedAt: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  };
}

function submittal(overrides: Partial<SubmittalWithProject>): SubmittalWithProject {
  return {
    id: "s1",
    number: "SUB-001",
    title: "Rebar shop drawings",
    specSection: "03 20 00",
    status: "UNDER_REVIEW",
    longLead: false,
    resubmittalCount: 0,
    currentReviewerEmail: null,
    sentToReviewerAt: daysAgo(3),
    submittedAt: daysAgo(3),
    approvedAt: null,
    rejectedAt: null,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(3),
    projectId: "p1",
    projectName: "Tower A",
    ...overrides,
  };
}

describe("agingBucket", () => {
  it("maps day counts to the right bucket boundaries", () => {
    expect(agingBucket(0)).toBe("0-7");
    expect(agingBucket(7)).toBe("0-7");
    expect(agingBucket(8)).toBe("8-14");
    expect(agingBucket(14)).toBe("8-14");
    expect(agingBucket(15)).toBe("15-30");
    expect(agingBucket(30)).toBe("15-30");
    expect(agingBucket(31)).toBe("31+");
    expect(agingBucket(999)).toBe("31+");
  });
  it("exposes buckets low→high", () => {
    expect(AGING_BUCKETS).toEqual(["0-7", "8-14", "15-30", "31+"]);
  });
});

describe("rfiToOpenItem", () => {
  it("excludes approved/closed RFIs", () => {
    expect(rfiToOpenItem(rfi({ status: "APPROVED" }), NOW)).toBeNull();
    expect(rfiToOpenItem(rfi({ status: "CLOSED" }), NOW)).toBeNull();
  });

  it("puts an unresponded UNDER_REVIEW RFI in the reviewer's court, aged from sentToReviewerAt", () => {
    const item = rfiToOpenItem(
      rfi({ status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(10), currentReviewerEmail: "aor@arch.com" }),
      NOW,
    )!;
    expect(item.court).toBe("REVIEWER");
    expect(item.responsibleParty).toBe("aor@arch.com");
    expect(item.daysInCourt).toBe(10);
    expect(item.bucket).toBe("8-14");
    expect(item.overdue).toBe(false); // 10 <= 14 SLA, no due date
  });

  it("returns the ball to the PM once responded, aged from respondedAt", () => {
    const item = rfiToOpenItem(rfi({ status: "UNDER_REVIEW", respondedAt: daysAgo(2) }), NOW)!;
    expect(item.court).toBe("CONTRACTOR");
    expect(item.daysInCourt).toBe(2);
    expect(item.responsibleParty).toBe("PM / originator");
  });

  it("flags overdue by SLA past 14 days", () => {
    const item = rfiToOpenItem(rfi({ status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(20) }), NOW)!;
    expect(item.overdue).toBe(true);
    expect(item.bucket).toBe("15-30");
  });

  it("flags overdue by an earlier due date even when young", () => {
    const item = rfiToOpenItem(
      rfi({ status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(2), dueDate: daysAgo(1) }),
      NOW,
    )!;
    expect(item.daysInCourt).toBe(2);
    expect(item.overdue).toBe(true);
  });

  it("DRAFT sits with the contractor, aged from createdAt", () => {
    const item = rfiToOpenItem(rfi({ status: "DRAFT", createdAt: daysAgo(4) }), NOW)!;
    expect(item.court).toBe("CONTRACTOR");
    expect(item.daysInCourt).toBe(4);
  });
});

describe("submittalToOpenItem", () => {
  it("excludes approved submittals", () => {
    expect(submittalToOpenItem(submittal({ status: "APPROVED", approvedAt: daysAgo(1) }), NOW)).toBeNull();
  });
  it("ages an in-review submittal in the reviewer's court", () => {
    const item = submittalToOpenItem(submittal({ sentToReviewerAt: daysAgo(9) }), NOW)!;
    expect(item.type).toBe("SUBMITTAL");
    expect(item.court).toBe("REVIEWER");
    expect(item.daysInCourt).toBe(9);
  });
});

describe("buildBallInCourtAging", () => {
  it("combines RFIs + submittals, sorts overdue-first, and rolls up buckets/parties", () => {
    const result = buildBallInCourtAging(
      {
        rfis: [
          rfi({ id: "a", status: "UNDER_REVIEW", sentToReviewerAt: daysAgo(20), currentReviewerEmail: "aor@arch.com" }), // overdue, REVIEWER, 20d
          rfi({ id: "b", status: "DRAFT", createdAt: daysAgo(3) }), // CONTRACTOR, 3d
          rfi({ id: "c", status: "APPROVED" }), // excluded
        ],
        submittals: [
          submittal({ id: "x", sentToReviewerAt: daysAgo(5), currentReviewerEmail: "aor@arch.com" }), // REVIEWER, 5d
        ],
      },
      NOW,
    );

    expect(result.items).toHaveLength(3);
    // Overdue item sorts first.
    expect(result.items[0]!.id).toBe("a");
    expect(result.items[0]!.overdue).toBe(true);

    expect(result.summary.totalOpen).toBe(3);
    expect(result.summary.overdue).toBe(1);
    expect(result.summary.withReviewer).toBe(2);
    expect(result.summary.withContractor).toBe(1);
    expect(result.summary.byBucket["31+"]).toBe(0);
    expect(result.summary.byBucket["15-30"]).toBe(1);
    expect(result.summary.byBucket["0-7"]).toBe(2);

    // aor@arch.com holds two items (one overdue) → sorts first by overdue.
    expect(result.summary.byParty[0]!.party).toBe("aor@arch.com");
    expect(result.summary.byParty[0]!.open).toBe(2);
    expect(result.summary.byParty[0]!.overdue).toBe(1);
    expect(result.summary.byParty[0]!.maxDays).toBe(20);

    expect(result.summary.oldestDays).toBe(20);
  });

  it("returns an empty, zeroed summary when nothing is open", () => {
    const result = buildBallInCourtAging({ rfis: [], submittals: [] }, NOW);
    expect(result.items).toEqual([]);
    expect(result.summary.totalOpen).toBe(0);
    expect(result.summary.avgDaysOpen).toBe(0);
    expect(result.summary.oldestDays).toBe(0);
    expect(result.summary.byParty).toEqual([]);
  });
});
