/**
 * Bid-leveling helpers — pure functions so they can be unit-tested
 * without a database. The page fetches sub-bids + their line items and
 * hands the already-loaded rows here; nothing in this file touches
 * Prisma or the network.
 *
 * "Leveling" normalizes competing sub-bids to an apples-to-apples basis
 * so a GC can compare totals, line items, and inclusions/exclusions side
 * by side, spot outliers, and pick an awardee with confidence.
 */

import { sumMoney, toNum, type MoneyLike } from "@/lib/money";

export type LevelingLine = {
  scopeItemKey: string;
  description: string;
  amount: MoneyLike;
  inclusion: boolean;
  notes?: string | null;
};

export type LevelingBidder = {
  subBidId: string;
  vendorId: string;
  vendorName: string;
  /** Bidder-stated lump-sum total (may differ from the sum of lines). */
  statedTotal: MoneyLike;
  daysToComplete?: number | null;
  inclusionsText?: string | null;
  exclusionsText?: string | null;
  lines: LevelingLine[];
};

export type LevelingCell = {
  vendorId: string;
  amount: number;
  inclusion: boolean;
  notes?: string | null;
  /** Lowest *included* amount in this row. */
  isLow: boolean;
  /** Statistical outlier (>40% above the row's included-bid average). */
  isOutlier: boolean;
};

export type LevelingRow = {
  scopeItemKey: string;
  description: string;
  cells: Map<string, LevelingCell>;
  /** vendorId of the lowest included bidder, or null if all excluded. */
  lowVendorId: string | null;
  /** Average of all included amounts in the row. */
  average: number;
};

export type BidderSummary = {
  subBidId: string;
  vendorId: string;
  vendorName: string;
  statedTotal: number;
  /** Sum of the bidder's *included* line items. */
  leveledTotal: number;
  lineCount: number;
  exclusionCount: number;
  daysToComplete: number | null;
  /** Delta of this bidder's leveled total vs. the lowest leveled total. */
  deltaVsLow: number;
  /** True if this is the lowest leveled total among all bidders. */
  isLowOverall: boolean;
};

/** Fraction above the row average at which a bid is flagged as an outlier. */
export const OUTLIER_THRESHOLD = 0.4;

/**
 * Build the scope-item × bidder matrix. Rows are keyed by scopeItemKey so
 * every bidder's line for the same scope item lines up in one row. The
 * lowest *included* amount per row is flagged; amounts more than
 * OUTLIER_THRESHOLD above the row's included average are flagged as
 * outliers (high cells only — a low cell is never an "outlier", it's the
 * winner).
 */
export function buildLevelingMatrix(bidders: LevelingBidder[]): LevelingRow[] {
  const rowMap = new Map<string, { description: string; cells: Map<string, LevelingCell> }>();

  for (const bidder of bidders) {
    for (const line of bidder.lines) {
      const slot =
        rowMap.get(line.scopeItemKey) ?? { description: line.description, cells: new Map<string, LevelingCell>() };
      if (!slot.description && line.description) slot.description = line.description;
      slot.cells.set(bidder.vendorId, {
        vendorId: bidder.vendorId,
        amount: toNum(line.amount),
        inclusion: line.inclusion,
        notes: line.notes ?? null,
        isLow: false,
        isOutlier: false,
      });
      rowMap.set(line.scopeItemKey, slot);
    }
  }

  const rows: LevelingRow[] = [];
  for (const [scopeItemKey, slot] of rowMap) {
    const included = Array.from(slot.cells.values()).filter((c) => c.inclusion);
    const average = included.length > 0 ? sumMoney(included.map((c) => c.amount)) / included.length : 0;

    let lowVendorId: string | null = null;
    let lowAmount = Infinity;
    for (const cell of included) {
      if (cell.amount < lowAmount) {
        lowAmount = cell.amount;
        lowVendorId = cell.vendorId;
      }
    }
    for (const cell of slot.cells.values()) {
      cell.isLow = cell.inclusion && cell.vendorId === lowVendorId;
      cell.isOutlier =
        cell.inclusion && !cell.isLow && average > 0 && cell.amount > average * (1 + OUTLIER_THRESHOLD);
    }

    rows.push({ scopeItemKey, description: slot.description, cells: slot.cells, lowVendorId, average });
  }

  rows.sort((a, b) => a.scopeItemKey.localeCompare(b.scopeItemKey));
  return rows;
}

/**
 * Per-bidder rollup. leveledTotal sums only *included* lines (an
 * exclusion isn't priced, so it shouldn't inflate the comparison). When a
 * bidder has no line items we fall back to their stated lump-sum total so
 * summary-only bids still compare. deltaVsLow / isLowOverall reference the
 * lowest leveled total across all bidders.
 */
export function buildBidderSummaries(bidders: LevelingBidder[]): BidderSummary[] {
  const prelim = bidders.map((b) => {
    const includedLines = b.lines.filter((l) => l.inclusion);
    const leveledFromLines = sumMoney(includedLines.map((l) => l.amount));
    const leveledTotal = b.lines.length > 0 ? leveledFromLines : toNum(b.statedTotal);
    return {
      subBidId: b.subBidId,
      vendorId: b.vendorId,
      vendorName: b.vendorName,
      statedTotal: toNum(b.statedTotal),
      leveledTotal,
      lineCount: b.lines.length,
      exclusionCount: b.lines.filter((l) => !l.inclusion).length,
      daysToComplete: b.daysToComplete ?? null,
    };
  });

  const priced = prelim.filter((p) => p.leveledTotal > 0);
  const lowTotal = priced.length > 0 ? Math.min(...priced.map((p) => p.leveledTotal)) : 0;

  return prelim.map((p) => ({
    ...p,
    deltaVsLow: p.leveledTotal > 0 ? Math.round((p.leveledTotal - lowTotal) * 100) / 100 : 0,
    isLowOverall: p.leveledTotal > 0 && p.leveledTotal === lowTotal,
  }));
}
