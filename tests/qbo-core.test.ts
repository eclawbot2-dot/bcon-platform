import { describe, it, expect } from "vitest";
import {
  buildQboInvoicePayload,
  classifyQboInvoice,
  decideLocalStatusFromQbo,
  parseArAgingReport,
  maskClientId,
  qboQueryEscape,
  BCON_PAYAPP_NOTE_PREFIX,
  type LocalPayAppStatus,
  type QboPaymentStatus,
} from "@/lib/integrations/qbo-core";

/**
 * QBO pure mapping/decision logic. The transition-guard cases encode
 * portfolio lessons from sibling apps:
 *   - VOIDED→REJECTED phantom-AR: a voided QBO invoice (TotalAmt=0,
 *     Balance=0) must classify as VOIDED (not PAID) and must NEVER
 *     change the local workflow status.
 *   - paid-status downgrade: a local PAID app must never be downgraded
 *     by a later UNPAID/PARTIAL pull.
 */

const app = {
  id: "pa_123",
  periodNumber: 4,
  periodTo: new Date("2026-05-31T00:00:00.000Z"),
  currentPaymentDue: 125_430.55,
  project: { code: "RIV-001", name: "Riverside Tower" },
};

describe("buildQboInvoicePayload", () => {
  it("maps amount, dates, customer ref, and the bcon correlation note", () => {
    const p = buildQboInvoicePayload(app, { value: "42", name: "Atlantic Development" });
    expect(p.DocNumber).toBe("PA-RIV-001-4");
    expect(p.TxnDate).toBe("2026-05-31");
    expect(p.DueDate).toBe("2026-06-30"); // net-30 from period end
    expect(p.PrivateNote).toBe(`${BCON_PAYAPP_NOTE_PREFIX}pa_123`);
    expect(p.CustomerRef).toEqual({ value: "42", name: "Atlantic Development" });
    expect(p.Line).toHaveLength(1);
    expect(p.Line[0].Amount).toBe(125_430.55);
    expect(p.Line[0].DetailType).toBe("SalesItemLineDetail");
    expect(p.Line[0].SalesItemLineDetail.ItemRef.value).toBe("1");
  });

  it("requests QBO-hosted online payment options (house rule: payment links from the accounting system)", () => {
    const p = buildQboInvoicePayload(app, { value: "1" });
    expect(p.AllowOnlineACHPayment).toBe(true);
    expect(p.AllowOnlineCreditCardPayment).toBe(true);
  });

  it("accepts Decimal-like money and rounds to cents", () => {
    const p = buildQboInvoicePayload(
      { ...app, currentPaymentDue: { toNumber: () => 100.005 } },
      { value: "1" },
    );
    expect(p.Line[0].Amount).toBeCloseTo(100.01, 2);
  });

  it("truncates DocNumber to QBO's 21-char limit", () => {
    const p = buildQboInvoicePayload(
      { ...app, periodNumber: 12, project: { code: "VERY-LONG-PROJECT-CODE-2026", name: "X" } },
      { value: "1" },
    );
    expect(p.DocNumber.length).toBeLessThanOrEqual(21);
  });

  it("honors a custom item ref", () => {
    const p = buildQboInvoicePayload(app, { value: "1" }, "77");
    expect(p.Line[0].SalesItemLineDetail.ItemRef.value).toBe("77");
  });
});

describe("classifyQboInvoice", () => {
  it("balance 0 with positive total = PAID", () => {
    expect(classifyQboInvoice({ Balance: 0, TotalAmt: 5000 })).toBe("PAID");
  });
  it("balance below total = PARTIAL", () => {
    expect(classifyQboInvoice({ Balance: 2000, TotalAmt: 5000 })).toBe("PARTIAL");
  });
  it("balance equal to total = UNPAID", () => {
    expect(classifyQboInvoice({ Balance: 5000, TotalAmt: 5000 })).toBe("UNPAID");
  });
  it("VOIDED phantom-AR guard: zeroed TotalAmt classifies VOIDED, never PAID", () => {
    // A voided QBO invoice reports Balance=0 AND TotalAmt=0 — the naive
    // "Balance===0 ⇒ PAID" check is the sibling-app bug.
    expect(classifyQboInvoice({ Balance: 0, TotalAmt: 0 })).toBe("VOIDED");
    expect(classifyQboInvoice({})).toBe("VOIDED");
  });
});

describe("decideLocalStatusFromQbo — transition guards", () => {
  const ALL_LOCAL: LocalPayAppStatus[] = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "PAID"];

  it("QBO PAID promotes only a local APPROVED app", () => {
    expect(decideLocalStatusFromQbo("APPROVED", "PAID")).toBe("PAID");
    for (const local of ALL_LOCAL.filter((s) => s !== "APPROVED")) {
      expect(decideLocalStatusFromQbo(local, "PAID")).toBeNull();
    }
  });

  it("VOIDED never changes local status (no VOIDED→REJECTED mapping)", () => {
    for (const local of ALL_LOCAL) {
      expect(decideLocalStatusFromQbo(local, "VOIDED")).toBeNull();
    }
  });

  it("UNPAID/PARTIAL never change local status — especially never downgrade PAID", () => {
    for (const qbo of ["UNPAID", "PARTIAL"] as QboPaymentStatus[]) {
      for (const local of ALL_LOCAL) {
        expect(decideLocalStatusFromQbo(local, qbo)).toBeNull();
      }
    }
  });

  it("a local PAID app is immutable under every QBO status", () => {
    for (const qbo of ["PAID", "PARTIAL", "UNPAID", "VOIDED"] as QboPaymentStatus[]) {
      expect(decideLocalStatusFromQbo("PAID", qbo)).toBeNull();
    }
  });
});

describe("parseArAgingReport", () => {
  const report = {
    Header: { EndPeriod: "2026-06-10" },
    Columns: {
      Column: [
        { ColTitle: "" },
        { ColTitle: "Current" },
        { ColTitle: "1 - 30" },
        { ColTitle: "31 - 60" },
        { ColTitle: "61 - 90" },
        { ColTitle: "91 and over" },
        { ColTitle: "Total" },
      ],
    },
    Rows: {
      Row: [
        { ColData: [{ value: "Some Customer" }, { value: "100.00" }] },
        {
          group: "GrandTotal",
          Summary: {
            ColData: [
              { value: "TOTAL" },
              { value: "1000.00" },
              { value: "250.50" },
              { value: "0.00" },
              { value: "75.25" },
              { value: "0.00" },
              { value: "1325.75" },
            ],
          },
        },
      ],
    },
  };

  it("extracts buckets and the grand total", () => {
    const snap = parseArAgingReport(report);
    expect(snap.asOf).toBe("2026-06-10");
    expect(snap.buckets).toEqual([
      { label: "Current", total: 1000 },
      { label: "1 - 30", total: 250.5 },
      { label: "31 - 60", total: 0 },
      { label: "61 - 90", total: 75.25 },
      { label: "91 and over", total: 0 },
    ]);
    expect(snap.total).toBe(1325.75);
  });

  it("tolerates an empty/missing report shape", () => {
    const snap = parseArAgingReport({}, new Date("2026-01-02T00:00:00Z"));
    expect(snap.buckets).toEqual([]);
    expect(snap.total).toBe(0);
    expect(snap.asOf).toBe("2026-01-02");
  });
});

describe("helpers", () => {
  it("maskClientId masks the middle", () => {
    expect(maskClientId("ABcdEFghIJklMNopQRst")).toBe("ABcd••••QRst");
    expect(maskClientId("tiny")).toBe("••••");
    expect(maskClientId(undefined)).toBe("—");
  });
  it("qboQueryEscape escapes single quotes", () => {
    expect(qboQueryEscape("O'Brien & Sons")).toBe("O\\'Brien & Sons");
  });
});
