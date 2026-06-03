import { describe, it, expect } from "vitest";
import { classifyDeterministic, classifyMail, MAIL_CLASSES } from "@/lib/mail/classify";

/**
 * Mail classification fail-safe. With no LLM configured (ENABLE_LLM_CALLS unset
 * in the test env), classifyMail() must fall back to the deterministic rules
 * and never throw — the read/triage feature has to work key-free.
 */
describe("mail classify (deterministic fail-safe)", () => {
  it("buckets known construction keywords", () => {
    expect(classifyDeterministic({ fromAddress: "sub@acme.com", subject: "RFI #12 — slab elevation" }).classification).toBe("RFI");
    expect(classifyDeterministic({ fromAddress: "x@y.com", subject: "Submittal 03 30 00 shop drawing" }).classification).toBe("SUBMITTAL");
    expect(classifyDeterministic({ fromAddress: "x@y.com", subject: "Change Order #4 (PCO)" }).classification).toBe("CHANGE_ORDER");
    expect(classifyDeterministic({ fromAddress: "x@y.com", subject: "Conditional lien waiver" }).classification).toBe("LIEN_WAIVER");
    expect(classifyDeterministic({ fromAddress: "v@y.com", subject: "Invoice 887 — amount due net 30" }).classification).toBe("AP_INVOICE");
    expect(classifyDeterministic({ fromAddress: "x@y.com", subject: "Invitation to bid — Pier 5" }).classification).toBe("LEAD");
  });

  it("returns OTHER for unmatched mail, never throws", () => {
    const r = classifyDeterministic({ fromAddress: "newsletter@example.com", subject: "Weekly digest" });
    expect(r.classification).toBe("OTHER");
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it("classifyMail returns a valid class via the fail-safe path (no LLM key)", async () => {
    const r = await classifyMail({ fromAddress: "sub@acme.com", subject: "RFI regarding column line" });
    expect(MAIL_CLASSES).toContain(r.classification);
    expect(r.classification).toBe("RFI");
    expect(r.model).toBe("deterministic-rules");
  });
});
