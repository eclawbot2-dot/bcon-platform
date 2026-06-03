/**
 * Mail classification for workspace-transparency triage.
 *
 * Routes through bcon's shared, fail-safe `aiCall` (src/lib/ai.ts): when no LLM
 * is configured (or the call fails / rate-limits) it returns the deterministic
 * fallback. This is READ/TRIAGE only — classification never auto-acts on a
 * message; it just buckets it so an admin can review the workspace's mail flow.
 */

import { aiCall } from "@/lib/ai";

export const MAIL_CLASSES = [
  "AP_INVOICE", // a bill / vendor invoice
  "AR_PAYMENT", // payment confirmation / remittance
  "RFI", // request for information
  "SUBMITTAL", // submittal / shop drawing
  "CHANGE_ORDER", // change order / PCO
  "LIEN_WAIVER", // lien waiver / notice
  "SAFETY", // safety incident / OSHA
  "LEAD", // bid invite / new opportunity / RFP
  "SCHEDULE", // schedule / look-ahead / delay
  "OTHER",
] as const;

export type MailClass = (typeof MAIL_CLASSES)[number];

export type MailClassification = {
  classification: MailClass;
  confidence: number; // 0..1
  model: string;
  reasoning: string | null;
};

export type MailClassifyInput = {
  fromAddress: string;
  fromName?: string | null;
  subject?: string | null;
  bodyText?: string | null;
};

const MAX_BODY = 12_000;

/**
 * Classify one message. `tenantId` lets aiCall use the tenant's own LLM key
 * (and per-tenant rate limit); without a key it falls back to deterministic
 * keyword rules — which is also what tests exercise.
 */
export async function classifyMail(
  input: MailClassifyInput,
  tenantId?: string,
): Promise<MailClassification> {
  const fallback = (): MailClassification => classifyDeterministic(input);

  return aiCall<MailClassification>({
    kind: "mail-triage",
    tenantId,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    maxTokens: 400,
    fallback,
    parse: (raw) => parseLlm(raw, input),
  });
}

const SYSTEM_PROMPT = `You triage inbound email for a general contractor's workspace.
Classify the email into exactly one of:
- AP_INVOICE: a vendor/subcontractor bill or invoice we owe
- AR_PAYMENT: a payment confirmation or remittance received
- RFI: a request for information
- SUBMITTAL: a submittal or shop drawing for review
- CHANGE_ORDER: a change order / proposed change / PCO
- LIEN_WAIVER: a lien waiver or preliminary notice
- SAFETY: a safety incident, near-miss, or OSHA matter
- LEAD: a bid invitation, RFP, or new project opportunity
- SCHEDULE: a schedule, look-ahead, or delay notice
- OTHER: anything else
Return ONLY a JSON object: {"classification":"RFI","confidence":0.0-1.0,"reasoning":"..."}`;

function buildPrompt(input: MailClassifyInput): string {
  const body = (input.bodyText ?? "").slice(0, MAX_BODY);
  return [
    `From: ${input.fromName ? `"${input.fromName}" <${input.fromAddress}>` : input.fromAddress}`,
    `Subject: ${input.subject ?? ""}`,
    "",
    "Body:",
    body,
  ].join("\n");
}

function parseLlm(raw: string, input: MailClassifyInput): MailClassification {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return classifyDeterministic(input);
    parsed = JSON.parse(m[0]);
  }
  const cls = (MAIL_CLASSES as readonly string[]).includes(parsed.classification)
    ? (parsed.classification as MailClass)
    : "OTHER";
  return {
    classification: cls,
    confidence: Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    model: "llm",
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 1000) : null,
  };
}

/** Deterministic keyword fallback — no network, always available. */
export function classifyDeterministic(input: MailClassifyInput): MailClassification {
  const hay = `${input.subject ?? ""}\n${input.bodyText ?? ""}`.toLowerCase();
  const rules: Array<{ cls: MailClass; re: RegExp; conf: number }> = [
    { cls: "RFI", re: /\b(rfi|request for information)\b/, conf: 0.7 },
    { cls: "SUBMITTAL", re: /\b(submittal|shop drawing|product data|sample submission)\b/, conf: 0.7 },
    { cls: "CHANGE_ORDER", re: /\b(change order|\bpco\b|\bcor\b|proposed change|change directive)\b/, conf: 0.7 },
    { cls: "LIEN_WAIVER", re: /\b(lien waiver|notice to owner|preliminary notice|mechanic'?s lien)\b/, conf: 0.7 },
    { cls: "SAFETY", re: /\b(safety incident|near miss|osha|injury|accident report|toolbox talk)\b/, conf: 0.7 },
    { cls: "AP_INVOICE", re: /\b(invoice|amount due|please remit|net 30|net 60|balance due|past due|payable)\b/, conf: 0.6 },
    { cls: "AR_PAYMENT", re: /\b(payment received|remittance|paid in full|ach credit|wire received|thank you for your payment)\b/, conf: 0.6 },
    { cls: "LEAD", re: /\b(bid invitation|invitation to bid|\bitb\b|request for proposal|\brfp\b|\brfq\b|new opportunity|prebid|pre-bid)\b/, conf: 0.6 },
    { cls: "SCHEDULE", re: /\b(look-?ahead|three week|3-week|schedule update|delay notice|baseline schedule|critical path)\b/, conf: 0.6 },
  ];
  for (const r of rules) {
    if (r.re.test(hay)) {
      return { classification: r.cls, confidence: r.conf, model: "deterministic-rules", reasoning: `matched ${r.cls} keywords` };
    }
  }
  return { classification: "OTHER", confidence: 0.4, model: "deterministic-rules", reasoning: null };
}
