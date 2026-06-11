import { describe, it, expect } from "vitest";
import { buildPayAppDueEvent, PAYAPP_DUE_KIND } from "@/lib/m365-calendar";

/** Pay-app due-date → Graph event content mapping (pure). */
describe("buildPayAppDueEvent", () => {
  const app = {
    periodNumber: 7,
    periodTo: new Date("2026-08-31T15:45:00.000Z"), // time component must not shift the date
    currentPaymentDue: { toNumber: () => 88_250.4 },
    project: { code: "RIV-001", name: "Riverside Tower" },
  };

  it("subject carries period number + project code; start pinned to 09:00 UTC on the due date", () => {
    const ev = buildPayAppDueEvent(app);
    expect(ev.subject).toBe("Pay app #7 due — RIV-001");
    expect(ev.start.toISOString()).toBe("2026-08-31T09:00:00.000Z");
  });

  it("body includes the amount due and the period end date", () => {
    const ev = buildPayAppDueEvent(app);
    expect(ev.bodyText).toContain("$88250.40");
    expect(ev.bodyText).toContain("2026-08-31");
    expect(ev.bodyText).toContain("Riverside Tower");
  });

  it("kind constant is stable (idempotency key component)", () => {
    expect(PAYAPP_DUE_KIND).toBe("payapp-due");
  });
});
