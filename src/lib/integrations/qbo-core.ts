/**
 * QuickBooks Online — PURE mapping/decision logic (no prisma, no fetch).
 * Unit-tested directly; the side-effectful sync routines in qbo.ts build
 * on these so payload shapes and status transitions are provable.
 */

import { toNum, roundCents, type MoneyLike } from "@/lib/money";

// ---------------------------------------------------------------------------
// Invoice push payload
// ---------------------------------------------------------------------------

export type QboInvoicePayload = {
  DocNumber: string;
  TxnDate: string;
  DueDate: string;
  PrivateNote: string;
  CustomerRef: { value: string; name?: string };
  AllowOnlineACHPayment: boolean;
  AllowOnlineCreditCardPayment: boolean;
  Line: Array<{
    DetailType: "SalesItemLineDetail";
    Amount: number;
    Description: string;
    SalesItemLineDetail: { ItemRef: { value: string } };
  }>;
};

export const BCON_PAYAPP_NOTE_PREFIX = "bcon-payapp:";

/**
 * Map one APPROVED bcon pay application to a QBO Invoice create payload.
 * Amount = currentPaymentDue (the net amount actually owed this period —
 * retainage and prior payments are already netted out on the G702).
 * PrivateNote carries the bcon row id so the pull side can correlate
 * without trusting DocNumber collisions.
 */
export function buildQboInvoicePayload(
  app: {
    id: string;
    periodNumber: number;
    periodTo: Date;
    currentPaymentDue: MoneyLike;
    project: { code: string; name: string };
  },
  customerRef: { value: string; name?: string },
  itemRef = "1",
): QboInvoicePayload {
  const amount = roundCents(toNum(app.currentPaymentDue));
  const txnDate = app.periodTo.toISOString().slice(0, 10);
  // Net-30 from period end — standard AIA progress-billing terms.
  const due = new Date(app.periodTo.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    DocNumber: `PA-${app.project.code}-${app.periodNumber}`.slice(0, 21), // QBO DocNumber max 21 chars
    TxnDate: txnDate,
    DueDate: due.toISOString().slice(0, 10),
    PrivateNote: `${BCON_PAYAPP_NOTE_PREFIX}${app.id}`,
    CustomerRef: customerRef,
    // Surface QBO-hosted online payment options on the invoice — payment
    // links always come from the accounting system (house rule: never a
    // direct processor charge from the app).
    AllowOnlineACHPayment: true,
    AllowOnlineCreditCardPayment: true,
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: amount,
        Description: `Pay application #${app.periodNumber} — ${app.project.name} (${app.project.code})`,
        SalesItemLineDetail: { ItemRef: { value: itemRef } },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Payment-status pull-back: classification + transition guards.
//
// Portfolio lessons baked in (sibling-app bugs):
//  * phantom-AR: a VOIDED QBO invoice has Balance=0 AND TotalAmt=0 — naive
//    "Balance===0 ⇒ PAID" marks voided invoices paid; mapping VOIDED to a
//    local REJECTED also created phantom AR downstream. VOIDED is recorded
//    on the qbo* columns only and NEVER changes local workflow status.
//  * paid-status downgrade: once a local pay app is PAID, a later pull
//    showing UNPAID/PARTIAL (e.g. payment deleted in QBO) must not silently
//    downgrade it — that's an accounting dispute for a human, not a sync.
// ---------------------------------------------------------------------------

export type QboPaymentStatus = "PAID" | "PARTIAL" | "UNPAID" | "VOIDED";

/** Classify a pulled QBO invoice by Balance/TotalAmt. */
export function classifyQboInvoice(inv: { Balance?: number | null; TotalAmt?: number | null }): QboPaymentStatus {
  const total = toNum(inv.TotalAmt ?? null);
  const balance = toNum(inv.Balance ?? null);
  if (total <= 0) return "VOIDED"; // voided invoices zero out TotalAmt
  if (balance <= 0) return "PAID";
  if (balance < total) return "PARTIAL";
  return "UNPAID";
}

export type LocalPayAppStatus = "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PAID";

/**
 * Decide whether a pulled QBO payment status may change the local pay-app
 * workflow status. Returns the new local status, or null for "no change"
 * (the qboPaymentStatus/qboBalance columns are still updated by the caller).
 *
 * Rules:
 *  - QBO PAID promotes ONLY a local APPROVED app to PAID (the same gate the
 *    in-app "Mark paid" action enforces). It never resurrects DRAFT/
 *    REJECTED rows and never re-applies to an already-PAID row.
 *  - VOIDED never changes local status (no VOIDED→REJECTED mapping).
 *  - PARTIAL/UNPAID never change local status — in particular they never
 *    downgrade a local PAID.
 */
export function decideLocalStatusFromQbo(local: LocalPayAppStatus, qbo: QboPaymentStatus): LocalPayAppStatus | null {
  if (qbo === "PAID" && local === "APPROVED") return "PAID";
  return null;
}

// ---------------------------------------------------------------------------
// AR aging report parser
// ---------------------------------------------------------------------------

export type ArAgingSnapshot = {
  asOf: string; // ISO date
  buckets: Array<{ label: string; total: number }>;
  total: number;
};

type QboReport = {
  Header?: { Time?: string; StartPeriod?: string; EndPeriod?: string };
  Columns?: { Column?: Array<{ ColTitle?: string; ColType?: string }> };
  Rows?: { Row?: Array<QboReportRow> };
};
type QboReportRow = {
  group?: string;
  Summary?: { ColData?: Array<{ value?: string }> };
  ColData?: Array<{ value?: string }>;
};

/**
 * Reduce QBO's AgedReceivables report JSON to bucket totals. The report's
 * grand-total row ("GrandTotal" group) carries one cell per column; column
 * 0 is the customer label, the rest are aging buckets + TOTAL.
 */
export function parseArAgingReport(report: QboReport, asOf = new Date()): ArAgingSnapshot {
  const columns = report.Columns?.Column ?? [];
  const rows = report.Rows?.Row ?? [];
  const grand = rows.find((r) => r.group === "GrandTotal");
  const cells = grand?.Summary?.ColData ?? [];

  const buckets: Array<{ label: string; total: number }> = [];
  let total = 0;
  for (let i = 1; i < columns.length; i++) {
    const label = columns[i]?.ColTitle?.trim() || `Bucket ${i}`;
    const raw = cells[i]?.value ?? "0";
    const value = roundCents(Number.parseFloat(raw) || 0);
    if (/^total$/i.test(label)) {
      total = value;
    } else {
      buckets.push({ label, total: value });
    }
  }
  if (total === 0) total = roundCents(buckets.reduce((s, b) => s + b.total, 0));
  return { asOf: (report.Header?.EndPeriod ?? asOf.toISOString().slice(0, 10)), buckets, total };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Mask a client id for display: first 4 + last 4. */
export function maskClientId(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "—";
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

/** Escape a string literal for a QBO SQL-ish query (single quotes doubled). */
export function qboQueryEscape(v: string): string {
  return v.replace(/'/g, "\\'");
}
