/**
 * Change-order value classification — single source of truth so every report
 * (commercial rollup, project change-orders, profit-audit, client AI, Xero P&L
 * snapshot) buckets COs identically.
 *
 * A change order alters the contract value only once it is APPROVED or, terminal,
 * EXECUTED. Both must count toward "approved CO value" — dropping EXECUTED
 * understates current contract value and overstates margin fade.
 *
 * "Pending" is the still-in-flight set (DRAFT, PENDING) — it must NOT include
 * REJECTED or VOID (dead COs) nor EXECUTED/APPROVED (already counted as approved).
 */

import { sumMoney, type MoneyLike } from "@/lib/money";

export type CoLike = { status: string; amount: MoneyLike };

/** A CO whose value is committed to the contract (signed off). */
export function isApprovedCo(status: string): boolean {
  return status === "APPROVED" || status === "EXECUTED";
}

/** A CO still in flight, not yet approved and not dead (REJECTED/VOID). */
export function isPendingCo(status: string): boolean {
  return status === "DRAFT" || status === "PENDING";
}

/** Sum of approved (incl. executed) change-order amounts. */
export function approvedCoValue(cos: ReadonlyArray<CoLike>): number {
  return sumMoney(cos.filter((c) => isApprovedCo(c.status)).map((c) => c.amount));
}

/** Sum of pending (draft/pending) change-order amounts. Excludes REJECTED/VOID. */
export function pendingCoValue(cos: ReadonlyArray<CoLike>): number {
  return sumMoney(cos.filter((c) => isPendingCo(c.status)).map((c) => c.amount));
}
