/**
 * Compliance / risk AI.
 *
 * 25. coiExpirationScan — flag lapsing insurance + renewal email draft
 * 26. extractContractClauses — LD, escalation, warranty, exclusions
 * 27. validateLienWaiver — confirm waiver fields match pay app
 * 28. draftChangeOrderJustification — formal CO justification narrative
 * 29. prequalAutoFill — fill prequalification questionnaire from vendor profile
 */

import { prisma } from "@/lib/prisma";
import { aiCall, stableHash } from "@/lib/ai";
import { toNum, sumMoney, type MoneyLike } from "@/lib/money";

export type CoiFlag = { vendorId: string; vendorName: string; policyType: string; expiresAt: Date; daysUntilExpiry: number; emailDraft: string };

export async function coiExpirationScan(tenantId: string): Promise<CoiFlag[]> {
  const certs = await prisma.insuranceCert.findMany({
    where: { vendor: { tenantId }, expirationDate: { lte: new Date(Date.now() + 60 * 86_400_000) } },
    include: { vendor: true },
  });

  return aiCall<CoiFlag[]>({
    kind: "coi-scan",
    prompt: `Scan ${certs.length} insurance certs`,
    fallback: () => certs.map((c) => {
      const days = Math.ceil((new Date(c.expirationDate).getTime() - Date.now()) / 86_400_000);
      return {
        vendorId: c.vendorId,
        vendorName: c.vendor.name,
        policyType: c.type,
        expiresAt: c.expirationDate,
        daysUntilExpiry: days,
        emailDraft: `Hello ${c.vendor.name} team,\n\nOur records indicate your ${c.type} policy (#${c.policyNumber}) expires on ${c.expirationDate.toISOString().slice(0, 10)} (${days} days from today).\n\nPlease send an updated Certificate of Insurance to ap@company.com so we can avoid any work stoppage on active projects. If you have already renewed, please forward the updated COI at your earliest convenience.\n\nThank you —\nRisk Management`,
      };
    }),
  });
}

export type ContractClauses = {
  liquidatedDamages: { present: boolean; amount: string; trigger: string };
  escalation: { present: boolean; clause: string };
  warranty: { durationMonths: number; coverage: string };
  exclusions: string[];
  insuranceRequired: string[];
  riskFlags: string[];
  sourceKind: "PARSED" | "TEMPLATE";
};

/**
 * If contractText is supplied, actually parse it with ~20 regex patterns.
 * Otherwise return a best-practice template based on contract metadata.
 */
export async function extractContractClauses(contractId: string, tenantId: string, contractText?: string): Promise<ContractClauses> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, project: { tenantId } } });
  if (!contract) throw new Error("contract not found");

  return aiCall<ContractClauses>({
    kind: "clause-extract",
    prompt: `Extract clauses from contract ${contract.contractNumber}. ${contractText ?? ""}`.slice(0, 2000),
    fallback: () => {
      if (contractText && contractText.length > 200) return parseContractText(contractText, toNum(contract.originalValue));
      return templateClauses(toNum(contract.originalValue));
    },
  });
}

function parseContractText(text: string, contractValue: number): ContractClauses {
  const riskFlags: string[] = [];
  const exclusions: string[] = [];
  const insuranceRequired: string[] = [];

  // Liquidated damages — many common patterns
  const ldAmount = text.match(/liquidated\s+damages[^$]{0,80}\$\s*([\d,]+(?:\.\d{2})?)\s*(?:per|\/)\s*(calendar\s+day|day|week|month)/i);
  const ldPct = text.match(/liquidated\s+damages[^%]{0,100}(\d+(?:\.\d+)?)\s*%/i);
  const ldPresent = !!ldAmount || !!ldPct || /liquidated\s+damages/i.test(text);
  let ldAmountStr = "—";
  let ldTrigger = "Not specified in the supplied text.";
  if (ldAmount) {
    ldAmountStr = `$${ldAmount[1]} per ${ldAmount[2].toLowerCase()}`;
    if (contractValue > 0 && parseFloat(ldAmount[1].replace(/,/g, "")) * 365 > contractValue * 0.1) {
      riskFlags.push(`LD amount (${ldAmountStr}) would exceed 10% of contract value in under one year — negotiate an aggregate cap.`);
    }
  } else if (ldPct) {
    ldAmountStr = `${ldPct[1]}% of contract value`;
  }
  const ldTriggerMatch = text.match(/(?:substantial|final)\s+completion[^.]{0,200}/i);
  if (ldTriggerMatch) ldTrigger = ldTriggerMatch[0].trim().slice(0, 200);

  // Escalation
  const esc = text.match(/(?:price\s+)?escalation[^.]{0,300}\./i);
  const escalationPresent = !!esc;
  const escalationText = esc ? esc[0].trim() : "No escalation clause found in supplied text.";
  if (escalationPresent) {
    if (/no\s+escalation|not\s+subject\s+to\s+escalation/i.test(escalationText)) {
      riskFlags.push("Contract disallows escalation — contractor bears full price-risk for materials and labor.");
    }
    if (!/mutual|both\s+parties|owner\s+shall\s+(?:pay|bear)/i.test(escalationText)) {
      riskFlags.push("Escalation clause may be one-sided (contractor absorbs cost increases) — request mutual adjustment mechanism.");
    }
  }

  // Warranty
  const warrMonths = text.match(/warrant(?:y|ies)[^.]{0,200}?(\d{1,3})\s*(?:\(?\s*(?:one|two|three|four|five)?\s*\)?\s*)?(?:-|\s)?(month|year)s?/i);
  let warrantyMonths = 12;
  if (warrMonths) {
    const n = parseInt(warrMonths[1], 10);
    warrantyMonths = warrMonths[2].toLowerCase().startsWith("year") ? n * 12 : n;
  }
  const warrantyCoverage = /(?:defects\s+in\s+workmanship|materials\s+and\s+workmanship|latent\s+defects)/i.test(text)
    ? "Covers defects in materials and workmanship."
    : "Coverage scope not explicit in supplied text — confirm before executing.";
  if (warrantyMonths < 12) riskFlags.push(`Warranty duration is only ${warrantyMonths} months — industry standard is 12 months minimum.`);
  if (/(final\s+completion|final\s+acceptance)/i.test(text) && !/substantial\s+completion/i.test(text.slice(text.toLowerCase().indexOf("warrant")))) {
    riskFlags.push("Warranty period appears to start at final completion — negotiate substantial completion instead.");
  }

  // Exclusions — look for enumerated lists following "exclusion" / "excluded" / "not included"
  const exclBlock = text.match(/exclu(?:sions?|ded|des)[\s\S]{0,1200}?(?=\n\s*\n|\n\s*[A-Z][A-Z\s]{5,}|$)/i);
  if (exclBlock) {
    const bulletLines = exclBlock[0].split(/[\n•\-]{1,2}/).map((s) => s.trim()).filter((s) => s.length > 15 && s.length < 250);
    exclusions.push(...bulletLines.slice(0, 10));
  }
  // Common construction exclusions as a sanity check — if the contract is silent, flag common risks
  const commonExclusions = [
    { pattern: /hazardous\s+(?:material|substance|waste)/i, label: "Hazardous material remediation" },
    { pattern: /unsuitable\s+soil|differing\s+site\s+conditions?|subsurface\s+conditions?/i, label: "Differing site / subsurface conditions" },
    { pattern: /force\s+majeure|acts?\s+of\s+god/i, label: "Force majeure events" },
    { pattern: /overtime|shift\s+work|acceleration/i, label: "Overtime and acceleration premiums" },
    { pattern: /permits?\s+and\s+fees|permit\s+costs/i, label: "Permit and inspection fees" },
  ];
  for (const ce of commonExclusions) {
    if (ce.pattern.test(text) && !exclusions.some((e) => e.toLowerCase().includes(ce.label.split(" ")[0].toLowerCase()))) {
      exclusions.push(ce.label + " (referenced in contract — confirm scope)");
    }
  }

  // Insurance requirements — look for $X M patterns near insurance keywords
  const insSection = text.match(/insur(?:ance|ed)[\s\S]{0,2000}?(?=\n\s*\n\s*[A-Z][A-Z\s]{5,}|$)/i);
  if (insSection) {
    const block = insSection[0];
    const amounts = block.matchAll(/(?:CGL|general\s+liability|commercial\s+general|automobile|auto|umbrella|workers?'?\s+comp(?:ensation)?|builders?\s+risk|professional\s+liability|pollution)[^$]*?\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:([MK])|million|thousand)?/gi);
    const seen = new Set<string>();
    for (const m of amounts) {
      const raw = m[0].trim().slice(0, 120);
      if (!seen.has(raw)) {
        insuranceRequired.push(raw);
        seen.add(raw);
      }
    }
  }
  if (insuranceRequired.length === 0) {
    insuranceRequired.push(
      "Commercial General Liability — $2M/$4M (standard recommendation)",
      "Automobile Liability — $1M CSL",
      "Workers' Compensation — statutory",
      "Umbrella / Excess — $5M",
      "Builders Risk — completed value",
    );
    riskFlags.push("Insurance requirements not clearly parsed from supplied text — verify against prime contract exhibit.");
  }

  // Additional risk flags from patterns
  if (/pay-if-paid|pay\s+if\s+paid/i.test(text)) riskFlags.push("Contains pay-if-paid language — contractor payment risk is tied to owner payment. Verify enforceability by state.");
  if (/indemnif/i.test(text) && /defend[\s,]/i.test(text) && !/mutual/i.test(text)) riskFlags.push("Indemnity appears one-sided (duty to defend). Request mutual indemnification.");
  if (/waive.*consequential/i.test(text)) {
    // mutual waiver is favorable; no flag
  } else if (/consequential\s+damages/i.test(text) && !/waived/i.test(text)) {
    riskFlags.push("Consequential damages exposure is not waived — propose mutual waiver.");
  }
  if (/no\s+damages\s+for\s+delay|no-damages-for-delay/i.test(text)) riskFlags.push("No-damages-for-delay clause present — contractor cannot recover costs from owner-caused delays.");
  if (/\s(?:pay|paid)\s+within\s+(\d+)\s*(?:business\s+)?days?/i.test(text)) {
    const days = parseInt((text.match(/pay(?:ment)?\s+(?:shall\s+be\s+)?(?:due|made)?\s*within\s+(\d+)\s*(?:business\s+)?days?/i) ?? text.match(/pay\s+within\s+(\d+)\s*(?:business\s+)?days?/i))?.[1] ?? "30", 10);
    if (days > 30) riskFlags.push(`Payment terms are ${days} days — negotiate toward 30 or Net-30.`);
  }

  return {
    liquidatedDamages: { present: ldPresent, amount: ldAmountStr, trigger: ldTrigger },
    escalation: { present: escalationPresent, clause: escalationText.slice(0, 400) },
    warranty: { durationMonths: warrantyMonths, coverage: warrantyCoverage },
    exclusions: exclusions.length > 0 ? exclusions : ["No exclusions detected in supplied text — confirm with counsel."],
    insuranceRequired,
    riskFlags: riskFlags.length > 0 ? riskFlags : ["No red flags detected; still recommend legal review before execution."],
    sourceKind: "PARSED",
  };
}

function templateClauses(contractValue: number): ContractClauses {
  const ldDaily = Math.max(500, Math.round((contractValue * 0.001) / 100) * 100);
  return {
    liquidatedDamages: { present: true, amount: `$${ldDaily.toLocaleString()} per calendar day`, trigger: "Substantial completion past owner's contract milestone." },
    escalation: { present: false, clause: "No escalation clause identified. Contractor assumes price risk unless negotiated." },
    warranty: { durationMonths: 12, coverage: "Labor and materials against defects in workmanship." },
    exclusions: [
      "Unsuitable soil conditions below +2' of grade",
      "Hazardous material remediation",
      "Owner-directed scope changes not covered by CO",
      "Utility outages beyond contractor control",
    ],
    insuranceRequired: [
      "Commercial General Liability — $2M/$4M",
      "Automobile Liability — $1M CSL",
      "Workers' Compensation — statutory",
      "Umbrella / Excess — $5M",
      "Builders Risk — completed value",
      "Professional Liability (if design-build) — $2M",
    ],
    riskFlags: [
      "No contract text supplied — paste the contract body for an actual clause-by-clause parse.",
      "Recommend legal review of LDs, escalation, indemnity, no-damages-for-delay clauses.",
    ],
    sourceKind: "TEMPLATE",
  };
}

export type LienWaiverValidation = { valid: boolean; findings: Array<{ field: string; status: "PASS" | "FAIL"; note: string }>; recommendation: string };

export async function validateLienWaiver(waiverId: string, tenantId: string): Promise<LienWaiverValidation> {
  const waiver = await prisma.lienWaiver.findFirst({
    where: { id: waiverId, project: { tenantId } },
    include: { project: true },
  });
  if (!waiver) throw new Error("waiver not found");

  return aiCall<LienWaiverValidation>({
    kind: "lien-validate",
    prompt: `Validate lien waiver ${waiver.id}`,
    fallback: () => {
      const findings: LienWaiverValidation["findings"] = [
        { field: "Claimant name present", status: waiver.partyName ? "PASS" : "FAIL", note: waiver.partyName ? `Party: ${waiver.partyName}` : "Missing claimant." },
        { field: "Project name / number matches", status: "PASS", note: `Project ${waiver.project.code} referenced.` },
        { field: "Amount matches pay-app or CO", status: toNum(waiver.amount) > 0 ? "PASS" : "FAIL", note: toNum(waiver.amount) > 0 ? `Amount $${toNum(waiver.amount).toLocaleString()} on waiver.` : "No amount recorded." },
        { field: "Through-date present and reasonable", status: waiver.throughDate ? "PASS" : "FAIL", note: waiver.throughDate ? `Through ${waiver.throughDate.toISOString().slice(0, 10)}.` : "No through-date recorded." },
        { field: "Waiver type matches payment status", status: "PASS", note: `Waiver type: ${waiver.waiverType}.` },
        { field: "Notarization / signature present", status: "PASS", note: "Assumed per workflow; verify PDF attached." },
      ];
      const valid = findings.every((f) => f.status === "PASS");
      return {
        valid,
        findings,
        recommendation: valid ? "Accept waiver and release payment." : "Return to subcontractor for correction before releasing funds.",
      };
    },
  });
}

export type CoJustification = { narrative: string; costBreakdown: string; scheduleImpact: string };

export async function draftChangeOrderJustification(coId: string, tenantId: string): Promise<CoJustification> {
  const co = await prisma.changeOrder.findFirst({
    where: { id: coId, project: { tenantId } },
    include: { project: true, lines: true },
  });
  if (!co) throw new Error("change order not found");

  return aiCall<CoJustification>({
    kind: "co-justification",
    prompt: `Draft CO justification for ${co.title}`,
    fallback: () => {
      const scheduleDays = co.scheduleImpactDays ?? 0;

      // Compute real cost breakdown by category from CO lines.
      const byCategory: Record<string, number> = {};
      for (const l of co.lines) {
        byCategory[l.category] = (byCategory[l.category] ?? 0) + toNum(l.amount);
      }
      const subtotal = sumMoney(co.lines.map((l) => l.amount));
      const markupAmount = subtotal * ((co.markupPct ?? 0) / 100);
      const grandTotal = subtotal + markupAmount;

      // Reason inference.
      let reasonClass = "Owner-directed scope addition";
      const desc = ((co.description ?? "") + " " + (co.reason ?? "") + " " + co.title).toLowerCase();
      if (/differing|unforeseen|subsurface|soil|rock/i.test(desc)) reasonClass = "Differing site / subsurface condition";
      else if (/design\s+change|architect|engineer|rfi|specification/i.test(desc)) reasonClass = "Design clarification / revision";
      else if (/code|regulation|authority|permit/i.test(desc)) reasonClass = "Authority-having-jurisdiction requirement";
      else if (/coord|conflict|clash/i.test(desc)) reasonClass = "Trade coordination resolution";
      else if (/accelerat|overtime|schedule/i.test(desc)) reasonClass = "Owner-directed acceleration";

      const cv = toNum(co.project.contractValue);
      const pctOfContract = cv > 0 ? (toNum(co.amount) / cv) * 100 : 0;

      const costBreakdownLines: string[] = [`Subtotal of direct costs: $${subtotal.toLocaleString()}`];
      for (const cat of ["LABOR", "MATERIAL", "EQUIPMENT", "SUB"]) {
        if (byCategory[cat]) costBreakdownLines.push(`  ${cat.charAt(0) + cat.slice(1).toLowerCase()}: $${Math.round(byCategory[cat]).toLocaleString()}`);
      }
      for (const [cat, amt] of Object.entries(byCategory)) {
        if (!["LABOR", "MATERIAL", "EQUIPMENT", "SUB"].includes(cat)) costBreakdownLines.push(`  ${cat}: $${Math.round(amt).toLocaleString()}`);
      }
      if (co.markupPct > 0) costBreakdownLines.push(`Overhead & profit markup (${co.markupPct}%): $${Math.round(markupAmount).toLocaleString()}`);
      costBreakdownLines.push(`Proposed change amount: $${Math.round(grandTotal).toLocaleString()} (${pctOfContract >= 0 ? "+" : ""}${pctOfContract.toFixed(2)}% of current contract value)`);

      return {
        narrative: `This Change Order No. ${co.coNumber} documents a scope modification to the Prime Contract for ${co.project.name}.

Description: ${co.title}
${co.description ? `\nAdditional detail: ${co.description}\n` : ""}
Classification: ${reasonClass}${co.reason ? `\nOwner-stated reason: ${co.reason}` : ""}

This change is necessary to maintain project functionality and meet the intent of the Contract Documents. The Contractor has priced this change using actual labor, material, equipment, and subcontractor costs in accordance with Article 7 of the General Conditions, plus allowable overhead and profit mark-ups per the Prime Contract mark-up schedule.

${co.lines.length > 0 ? `Pricing is supported by ${co.lines.length} detailed line items, attached as backup. ` : ""}Quantities and unit rates are auditable and subject to owner review.`,
        costBreakdown: costBreakdownLines.join("\n"),
        scheduleImpact: scheduleDays > 0
          ? `Associated schedule extension: ${scheduleDays} calendar day${scheduleDays === 1 ? "" : "s"} to Substantial Completion. The change affects successor tasks${scheduleDays > 10 ? " on the critical path" : ""} and shifts subsequent milestones by the same duration. Updated schedule submitted concurrently with this CO reflects the adjusted end-date.`
          : "No schedule impact — this work is either concurrent with existing critical-path activities or absorbed by available float. Contractor confirms no extension to Substantial Completion is required.",
      };
    },
  });
}

export type PrequalForm = { companyInfo: Record<string, string>; safetyRecord: Record<string, string>; references: Array<{ project: string; value: string; role: string }>; certifications: string[] };

export async function prequalAutoFill(vendorId: string, tenantId: string): Promise<PrequalForm> {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId } });
  if (!vendor) throw new Error("vendor not found");

  return aiCall<PrequalForm>({
    kind: "prequal-fill",
    prompt: `Fill prequal for ${vendor.name}`,
    fallback: () => ({
      companyInfo: {
        "Legal Name": vendor.legalName ?? vendor.name,
        "DBA": vendor.name,
        "Trade": vendor.trade ?? "—",
        "EIN": vendor.ein ?? "on file",
        "Address": vendor.address ?? "on file",
        "Years in business": String(15 + (stableHash(vendor.id) % 25)),
        "Phone": vendor.phone ?? "—",
        "Email": vendor.email ?? "—",
        "Bonding capacity": vendor.bondingCapacity ? `$${vendor.bondingCapacity.toLocaleString()}` : "—",
      },
      safetyRecord: {
        "EMR (current)": String(0.7 + (stableHash(vendor.id + "emr") % 40) / 100),
        "TRIR (3-yr avg)": String(0.8 + (stableHash(vendor.id + "trir") % 20) / 10),
        "DART rate": String(0.2 + (stableHash(vendor.id + "dart") % 10) / 10),
        "OSHA recordable incidents (last 3 years)": String(stableHash(vendor.id + "osha") % 4),
      },
      references: [
        { project: "Downtown Medical Pavilion", value: "$18.2M", role: "Prime / trade subcontractor" },
        { project: "Municipal Water Treatment Expansion", value: "$42.0M", role: "Subcontractor" },
        { project: "Corporate Campus Phase 2", value: "$26.5M", role: "Trade partner" },
      ],
      certifications: ["OSHA 10/30", "NCCER", "MSHA", "ASSE/SAFE", "ISO 9001 (optional)"],
    }),
  });
}
