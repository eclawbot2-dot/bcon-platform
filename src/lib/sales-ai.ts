/**
 * Sales / BD AI helpers.
 *
 * 1. scoreRfpListing — go/no-go score with confidence
 * 2. tailorProposalThemes — regenerate win themes in client voice
 * 3. draftSubOutreach — invitation-to-bid email per trade
 * 4. pricingAdvisor — flag margin vs historical win rate
 * 5. deepComplianceCheck — expanded compliance assessment
 *
 * All functions are deterministic today; aiCall() will route to Claude
 * when ENABLE_LLM_CALLS=true.
 */

import { prisma } from "@/lib/prisma";
import { aiCall, stableHash } from "@/lib/ai";
import { toNum } from "@/lib/money";

export type ScoreResult = {
  recommendation: "BID" | "NO_BID" | "CONDITIONAL";
  confidence: number;
  winProbability: number;
  rationale: string[];
  risks: string[];
};

export async function scoreRfpListing(tenantId: string, listingId: string): Promise<ScoreResult> {
  const listing = await prisma.rfpListing.findFirst({ where: { id: listingId, tenantId } });
  if (!listing) throw new Error("listing not found");

  const priorOpps = await prisma.opportunity.count({ where: { tenantId, clientName: listing.agency } });
  const wonOpps = await prisma.opportunity.count({ where: { tenantId, clientName: listing.agency, stage: "AWARDED" } });
  const clientWinRate = priorOpps > 0 ? Math.round((wonOpps / priorOpps) * 100) : 25;

  return aiCall<ScoreResult>({
    kind: "rfp-score",
    prompt: `Score this RFP: ${listing.title} — agency ${listing.agency} — value ${listing.estimatedValue ?? "unknown"}. Prior win rate with this client: ${clientWinRate}%.`,
    fallback: () => {
      const value = toNum(listing.estimatedValue);
      const titleHash = stableHash(listing.title);
      const valueScore = value > 5_000_000 ? 15 : value > 500_000 ? 30 : 10;
      const winProbability = Math.min(92, Math.max(8, clientWinRate + valueScore + (titleHash % 15)));
      const rec: ScoreResult["recommendation"] =
        winProbability >= 55 ? "BID" : winProbability >= 30 ? "CONDITIONAL" : "NO_BID";
      const rationale: string[] = [];
      const risks: string[] = [];
      if (clientWinRate > 30) rationale.push(`Repeat client — ${clientWinRate}% historical win rate across ${priorOpps} opps.`);
      if (value && value > 1_000_000) rationale.push(`High-value solicitation ($${value.toLocaleString()}) aligns with target portfolio.`);
      if (listing.naicsCode) rationale.push(`NAICS ${listing.naicsCode} matches tenant capability set.`);
      if (listing.setAside) rationale.push(`Set-aside: ${listing.setAside} — check eligibility before pursuing.`);
      if (!listing.estimatedValue) risks.push("No estimated value disclosed — difficult to size pursuit cost.");
      if (listing.dueAt) {
        const daysLeft = Math.round((new Date(listing.dueAt).getTime() - Date.now()) / 86_400_000);
        if (daysLeft < 10) risks.push(`Only ${daysLeft} days until due — short response window.`);
      }
      if (clientWinRate < 15 && priorOpps > 2) risks.push(`Low historical win rate (${clientWinRate}%) with this agency.`);
      if (rationale.length === 0) rationale.push("Solicitation characteristics within normal pursuit parameters.");
      return {
        recommendation: rec,
        confidence: 60 + (titleHash % 25),
        winProbability,
        rationale,
        risks,
      };
    },
  });
}

export type TailoredProposal = {
  winThemes: string;
  differentiators: string;
  coverLetter: string;
};

export async function tailorProposalThemes(draftId: string): Promise<TailoredProposal> {
  const draft = await prisma.bidDraft.findUnique({ where: { id: draftId }, include: { rfpListing: true } });
  if (!draft) throw new Error("draft not found");

  // Pull real past-performance references from the tenant's completed projects + awarded opportunities.
  const pastProjects = await prisma.project.findMany({
    where: {
      tenantId: draft.tenantId,
      stage: { in: ["CLOSEOUT", "WARRANTY"] },
      contractValue: { not: null },
      ...(draft.rfpListing?.placeOfPerformance ? {} : {}),
    },
    select: { name: true, contractValue: true, mode: true, ownerName: true, code: true },
    orderBy: { contractValue: "desc" },
    take: 5,
  });
  const wonOpps = await prisma.opportunity.findMany({
    where: { tenantId: draft.tenantId, stage: "AWARDED" },
    select: { name: true, clientName: true, estimatedValue: true, mode: true },
    orderBy: { estimatedValue: "desc" },
    take: 5,
  });

  return aiCall<TailoredProposal>({
    kind: "proposal-tone",
    prompt: `Tailor proposal themes for bid ${draft.title}`,
    fallback: () => {
      const agency = draft.rfpListing?.agency ?? "the owner";
      const title = draft.title;
      const listingMode = draft.rfpListing?.placeOfPerformance ?? "";
      const naics = draft.rfpListing?.naicsCode;

      // Pick the top 3 most-relevant past projects for past-performance references.
      const relevant = pastProjects
        .map((p) => ({ ...p, score: (draft.opportunityId && p.ownerName === draft.rfpListing?.agency ? 50 : 0) + toNum(p.contractValue) / 1_000_000 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const pastPerfBlock = relevant.length > 0
        ? relevant.map((p) => `  • ${p.code} — ${p.name} (${p.ownerName ?? "private owner"}, $${toNum(p.contractValue).toLocaleString()})`).join("\n")
        : "  • [Attach past-performance matrix to final proposal]";

      const repeatClient = relevant.some((p) => p.ownerName && draft.rfpListing?.agency && p.ownerName.toLowerCase().includes(draft.rfpListing.agency.toLowerCase().slice(0, 12)));

      return {
        winThemes: [
          `1. ${repeatClient ? `Continued partnership with ${agency} — proven on ${relevant.filter((r) => r.ownerName === agency).length} prior engagements.` : `Proven delivery on projects similar to ${title} in scope, value, and complexity.`}`,
          `2. Deep bench of field-tested superintendents with direct ${naics ? `NAICS ${naics} ` : ""}experience — we put our best on this job.`,
          `3. Transparent cost controls: weekly owner reporting, committed-cost tracking, and early warning on any variance over 2%.`,
          `4. Local subcontractor network ${listingMode ? `in ${listingMode} ` : ""}reduces mobilization risk and escalation exposure.`,
          `5. Self-perform capability means fewer seams and faster recovery when schedule risks emerge.`,
        ].join("\n"),
        differentiators: [
          `• Past performance (${wonOpps.length + pastProjects.length} completed engagements on file):`,
          pastPerfBlock,
          `• Self-performed trades for ${naics ? `NAICS ${naics}` : "critical scope"} — no layered markup on foundational work.`,
          `• ISO 9001-style QA/QC playbook adapted to ${agency} specifications.`,
          `• Safety record: target TRIR below 1.5 (industry average ~3.2); weekly stretch-and-flex + pre-task plans on every project.`,
          `• Weekly 4D schedule coordination with owner and design team — risks surface before they impact critical path.`,
          `• Dedicated Project Executive assigned for the life of the contract.`,
        ].join("\n"),
        coverLetter: `Dear Contracting Officer,

We are pleased to submit this proposal for ${title}. Our team brings directly relevant experience${relevant.length > 0 ? `, including ${relevant[0].name}${relevant.length > 1 ? ` and ${relevant[1].name}` : ""}` : ""}, along with the financial strength, safety record, and project-management discipline needed to deliver on time and on budget.

${repeatClient ? `We appreciate the opportunity to continue our working relationship with ${agency}. Past performance is the strongest indicator of future success, and we have earned your trust on prior engagements.` : `We view this pursuit as the start of a long-term partnership with ${agency}.`}

Our proposal is structured to demonstrate compliance with every requirement of the solicitation, price the scope transparently, and present the team that will actually deliver the project. We welcome the opportunity to present in person and answer any questions.

Respectfully,
Project Executive`,
      };
    },
  });
}

export type SubOutreachEmail = {
  subject: string;
  body: string;
};

export async function draftSubOutreach(params: {
  trade: string;
  scope: string;
  estimatedValue?: number;
  dueDate?: Date;
  projectName: string;
  tenantId?: string;
  vendorId?: string;
}): Promise<SubOutreachEmail> {
  const { trade, scope, estimatedValue, dueDate, projectName, tenantId, vendorId } = params;

  // If we have a specific vendor, personalize with their name + trade-match.
  const vendor = vendorId && tenantId
    ? await prisma.vendor.findFirst({ where: { id: vendorId, tenantId }, include: { insuranceCerts: true } })
    : null;
  const priorWorked = vendorId && tenantId
    ? await prisma.subInvoice.count({ where: { vendorId, project: { tenantId } } })
    : 0;

  return aiCall<SubOutreachEmail>({
    kind: "sub-outreach",
    prompt: `Draft ITB email for ${trade} on ${projectName}`,
    fallback: () => {
      const vendorGreeting = vendor ? `${vendor.name} team` : "team";
      const relationship = priorWorked > 0
        ? `As you know from our ${priorWorked} prior engagement${priorWorked === 1 ? "" : "s"}, we value partners who deliver on schedule and within budget.`
        : `We are actively building our trade-partner bench and view this as a first step toward a longer-term relationship.`;
      const coiReminder = vendor && vendor.insuranceCerts.some((c) => c.expirationDate < new Date(Date.now() + 30 * 86_400_000))
        ? `\nNote: our records show one or more of your insurance certificates expires in the next 30 days. Please include updated COI with your proposal.`
        : "";
      return {
        subject: `Invitation to Bid — ${trade} — ${projectName}`,
        body: `Hello ${vendorGreeting},

We are preparing our bid response for ${projectName} and would like to invite you to quote the ${trade} scope outlined below. ${relationship}

Scope summary:
${scope}

${estimatedValue ? `Estimated range: ~$${estimatedValue.toLocaleString()}.\n` : ""}${dueDate ? `Please return pricing by ${dueDate.toLocaleDateString()}.\n` : "Please return pricing as soon as practical.\n"}
With your proposal, please include:
  • Lump-sum base bid plus unit prices for visible scope
  • Explicit inclusions and exclusions
  • Insurance limits (CGL, auto, workers comp, umbrella) and bonding capacity
  • Lead times for long-lead items
  • Two recent project references of similar scope and dollar value
  • Confirmation of your safety program (TRIR, EMR)${coiReminder}

This is a competitive ITB. We will issue a Notice of Award within 10 business days of bid close. Please direct questions to estimating@company.com.

Thank you —
Estimating Team`,
      };
    },
  });
}

export type PricingAdvice = {
  suggestedMargin: number;
  currentMargin: number;
  direction: "RAISE" | "LOWER" | "HOLD";
  rationale: string;
  winRateAtCurrent: number;
  winRateAtSuggested: number;
};

export async function pricingAdvisor(draftId: string): Promise<PricingAdvice> {
  const draft = await prisma.bidDraft.findUnique({ where: { id: draftId }, include: { rfpListing: true, opportunity: true } });
  if (!draft) throw new Error("draft not found");
  const current = draft.overheadPct + draft.profitPct;

  // Gather per-mode and per-client win rates. We use a Bayesian prior so tiny
  // sample sizes don't produce wild estimates — a 2-of-3 "win rate" shouldn't
  // be weighted the same as 40-of-80.
  const [tenantWon, tenantLost, mode, client] = await Promise.all([
    prisma.opportunity.count({ where: { tenantId: draft.tenantId, stage: "AWARDED" } }),
    prisma.opportunity.count({ where: { tenantId: draft.tenantId, stage: "LOST" } }),
    draft.opportunity?.mode ?? draft.rfpListing?.title ? prisma.opportunity.groupBy({
      by: ["stage"],
      where: { tenantId: draft.tenantId, mode: draft.opportunity?.mode ?? "VERTICAL" },
      _count: { _all: true },
    }) : Promise.resolve([] as Array<{ stage: string; _count: { _all: number } }>),
    draft.rfpListing?.agency ? prisma.opportunity.groupBy({
      by: ["stage"],
      where: { tenantId: draft.tenantId, clientName: draft.rfpListing.agency },
      _count: { _all: true },
    }) : Promise.resolve([] as Array<{ stage: string; _count: { _all: number } }>),
  ]);

  return aiCall<PricingAdvice>({
    kind: "pricing-advisor",
    prompt: `Pricing advice for draft ${draft.title} at current margin ${current}%`,
    fallback: () => {
      // Bayesian-smoothed win rate: prior = 30% with n=10, update with observed.
      function smooth(won: number, total: number): number {
        const priorWon = 3; // 30% of 10
        const priorN = 10;
        return ((priorWon + won) / (priorN + total)) * 100;
      }
      const totalDecided = tenantWon + tenantLost;
      const tenantWinRate = smooth(tenantWon, totalDecided);

      const modeWon = (mode as Array<{ stage: string; _count: { _all: number } }>).find((m) => m.stage === "AWARDED")?._count._all ?? 0;
      const modeLost = (mode as Array<{ stage: string; _count: { _all: number } }>).find((m) => m.stage === "LOST")?._count._all ?? 0;
      const modeWinRate = smooth(modeWon, modeWon + modeLost);

      const clientWon = (client as Array<{ stage: string; _count: { _all: number } }>).find((c) => c.stage === "AWARDED")?._count._all ?? 0;
      const clientLost = (client as Array<{ stage: string; _count: { _all: number } }>).find((c) => c.stage === "LOST")?._count._all ?? 0;
      const clientDecided = clientWon + clientLost;
      const clientWinRate = smooth(clientWon, clientDecided);

      // Blend: weight client signal heavily when we have enough data, else fall back on mode, then tenant.
      const clientWeight = Math.min(1, clientDecided / 5);
      const modeWeight = Math.min(1, (modeWon + modeLost) / 10) * (1 - clientWeight);
      const tenantWeight = 1 - clientWeight - modeWeight;
      const blended = clientWeight * clientWinRate + modeWeight * modeWinRate + tenantWeight * tenantWinRate;

      // Margin elasticity model: each point above the "zone" (~18%) costs ~3 pts of win rate;
      // each point below adds ~2 pts but eats margin.
      const ZONE = 18;
      function projectedWinRate(margin: number): number {
        const delta = margin - ZONE;
        const elasticity = delta > 0 ? -3 : -2; // win rate falls faster above zone
        return Math.max(5, Math.min(90, blended + elasticity * delta));
      }

      let direction: PricingAdvice["direction"] = "HOLD";
      let suggested = current;
      if (current > 22) { direction = "LOWER"; suggested = 19; }
      else if (current < 14) { direction = "RAISE"; suggested = 17; }
      else if (clientDecided >= 5 && clientWinRate > 50 && current < 20) { direction = "RAISE"; suggested = Math.min(22, current + 2); }

      const currentWin = projectedWinRate(current);
      const suggestedWin = projectedWinRate(suggested);

      const rationaleParts: string[] = [];
      rationaleParts.push(`Tenant blended win rate ${blended.toFixed(0)}% (client signal ${clientWinRate.toFixed(0)}% from ${clientDecided} bids, mode ${modeWinRate.toFixed(0)}%, tenant overall ${tenantWinRate.toFixed(0)}%).`);
      if (direction === "LOWER") rationaleParts.push(`Margin ${current.toFixed(1)}% is above the ~${ZONE}% zone where similar bids convert. Lowering to ${suggested.toFixed(1)}% trades ~${(current - suggested).toFixed(1)} points of margin for a projected ${Math.round(suggestedWin - currentWin)}-point lift in win rate.`);
      if (direction === "RAISE") {
        if (clientDecided >= 5 && clientWinRate > 50) rationaleParts.push(`Historical win rate with this client is strong (${clientWinRate.toFixed(0)}%) — safe to raise margin to ${suggested.toFixed(1)}% without materially hurting win probability.`);
        else rationaleParts.push(`Margin ${current.toFixed(1)}% is thin; similar historical bids held margin at ${suggested.toFixed(1)}% with acceptable win rate.`);
      }
      if (direction === "HOLD") rationaleParts.push(`Margin ${current.toFixed(1)}% is inside the zone where tenant wins ~${Math.round(currentWin)}% of bids. No change recommended.`);

      return {
        suggestedMargin: suggested,
        currentMargin: current,
        direction,
        rationale: rationaleParts.join(" "),
        winRateAtCurrent: Math.round(currentWin),
        winRateAtSuggested: Math.round(suggestedWin),
      };
    },
  });
}

export type DeepComplianceResult = {
  overall: "PASS" | "FAIL" | "WARN";
  findings: Array<{ category: string; requirement: string; status: "PASS" | "FAIL" | "WARN"; note: string }>;
  summary: string;
};

export async function deepComplianceCheck(draftId: string): Promise<DeepComplianceResult> {
  const draft = await prisma.bidDraft.findUnique({
    where: { id: draftId },
    include: { rfpListing: true, sections: true, lineItems: true },
  });
  if (!draft) throw new Error("draft not found");

  return aiCall<DeepComplianceResult>({
    kind: "deep-compliance",
    prompt: `Deep compliance check for ${draft.title}`,
    fallback: () => {
      const findings: DeepComplianceResult["findings"] = [];
      const totalWords = draft.sections.reduce((s, sec) => s + sec.wordCount, 0);
      findings.push({
        category: "FORMAT",
        requirement: "Proposal has executive summary section",
        status: draft.sections.some((s) => /executive|summary/i.test(s.heading)) ? "PASS" : "WARN",
        note: "Recommend clearly labeled Executive Summary on first content page.",
      });
      findings.push({
        category: "FORMAT",
        requirement: "Page count within typical RFP limit (≤ 60 pages)",
        status: totalWords > 25_000 ? "WARN" : "PASS",
        note: `Estimated ${Math.ceil(totalWords / 500)} pages.`,
      });
      findings.push({
        category: "PRICING",
        requirement: "Line-item breakdown provided",
        status: draft.lineItems.length >= 5 ? "PASS" : "FAIL",
        note: `${draft.lineItems.length} line items — RFPs typically require ≥ 10.`,
      });
      findings.push({
        category: "PRICING",
        requirement: "Overhead and profit stated separately",
        status: draft.overheadPct > 0 && draft.profitPct > 0 ? "PASS" : "WARN",
        note: `Overhead ${draft.overheadPct}% + profit ${draft.profitPct}%.`,
      });
      findings.push({
        category: "TECHNICAL",
        requirement: "Win themes present",
        status: draft.winThemes && draft.winThemes.length > 100 ? "PASS" : "WARN",
        note: "Evaluators score proposals higher when win themes are explicit.",
      });
      findings.push({
        category: "TECHNICAL",
        requirement: "Key differentiators cited",
        status: draft.keyDifferentiators && draft.keyDifferentiators.length > 50 ? "PASS" : "WARN",
        note: "Call out self-perform, safety, past performance explicitly.",
      });
      findings.push({
        category: "REGULATORY",
        requirement: "DBE/HUBZone/8(a) set-aside addressed if applicable",
        status: draft.rfpListing?.setAside ? "WARN" : "PASS",
        note: draft.rfpListing?.setAside ? `Set-aside: ${draft.rfpListing.setAside} — confirm eligibility documentation attached.` : "No set-aside flagged.",
      });
      findings.push({
        category: "REGULATORY",
        requirement: "SAM.gov registration active",
        status: "PASS",
        note: "Verify UEI active within 12 months of proposal submission.",
      });
      findings.push({
        category: "SCHEDULE",
        requirement: "Proposed timeline aligns with RFP performance period",
        status: "WARN",
        note: "Attach Gantt or milestone table that mirrors solicitation's period-of-performance.",
      });
      findings.push({
        category: "PAST_PERFORMANCE",
        requirement: "At least 3 relevant past-performance references",
        status: "WARN",
        note: "Agency evaluators weight past performance 25-40% — include CPARS references if federal.",
      });
      const fails = findings.filter((f) => f.status === "FAIL").length;
      const warns = findings.filter((f) => f.status === "WARN").length;
      const overall: DeepComplianceResult["overall"] = fails > 0 ? "FAIL" : warns > 2 ? "WARN" : "PASS";
      return {
        overall,
        findings,
        summary: `${findings.length - fails - warns} pass · ${warns} warn · ${fails} fail. ${overall === "PASS" ? "Ready for submission review." : overall === "WARN" ? "Address warnings before final submit." : "Must resolve failures before submission."}`,
      };
    },
  });
}
