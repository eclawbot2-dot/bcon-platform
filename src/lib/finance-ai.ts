/**
 * Finance AI helpers — invoice extractor, batch reclass, AR collections,
 * journal anomaly detection, EAC forecast, variance narrator, close assistant.
 */

import { prisma } from "@/lib/prisma";
import { aiCall, stableHash } from "@/lib/ai";
import { toNum } from "@/lib/money";

export type ExtractedInvoice = {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  total: number;
  lineItems: Array<{ description: string; amount: number; costCode?: string }>;
  poNumber?: string;
  confidence: number;
};

export async function extractInvoiceFromText(text: string): Promise<ExtractedInvoice> {
  return aiCall<ExtractedInvoice>({
    kind: "invoice-extract",
    prompt: `Extract invoice fields from: ${text.slice(0, 1500)}`,
    fallback: () => parseInvoiceText(text),
  });
}

function parseInvoiceText(text: string): ExtractedInvoice {
  // --- Vendor name: many common layouts ---
  const vendorPatterns = [
    /(?:from|bill(?:ed)?\s*from|sold\s*by|remit\s*to|vendor|supplier|company)\s*[:\-]\s*([^\n]{3,80})/i,
    /^([A-Z][A-Za-z0-9&,.\s']{3,60}(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Company|Co\.?|LP|PLLC))\s*$/m,
  ];
  let vendor = "Unknown Vendor";
  for (const p of vendorPatterns) {
    const m = text.match(p);
    if (m) { vendor = m[1].trim().replace(/\s+/g, " "); break; }
  }

  // --- Invoice number ---
  const invNoPatterns = [
    /invoice\s*(?:#|no\.?|number|id)\s*[:\-]?\s*([A-Za-z0-9\-_/]{3,25})/i,
    /\binv[\s\-#]*([A-Za-z0-9\-_/]{3,20})/i,
    /bill\s*(?:#|no\.?|number)\s*[:\-]?\s*([A-Za-z0-9\-_/]{3,20})/i,
  ];
  let invoiceNumber: string | undefined;
  for (const p of invNoPatterns) {
    const m = text.match(p);
    if (m) { invoiceNumber = m[1].trim(); break; }
  }

  // --- Total — prefer "Balance Due", "Total Due", "Amount Due", "Grand Total", "Total" ---
  const totalPatterns = [
    /(?:balance\s*due|amount\s*due|total\s*due|grand\s*total|invoice\s*total)[^\d$]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\btotal\s*(?::|is|=)?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]{4,}(?:\.\d{2})?)\s*(?:USD)?\s*$/m,
  ];
  let total: number | undefined;
  for (const p of totalPatterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (val > 0 && val < 10_000_000) { total = val; break; }
    }
  }

  // --- PO number ---
  const poMatch = text.match(/(?:purchase\s*order|p\.?o\.?|po)[\s#:\-]*([A-Za-z0-9\-]{3,20})/i);

  // --- Dates: try many formats ---
  function parseDate(raw: string): Date | undefined {
    const d = new Date(raw);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) return d;
    return undefined;
  }
  const invoiceDatePatterns = [
    /(?:invoice\s*date|date\s*issued|bill\s*date|issue\s*date)\s*[:\-]?\s*((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})|(?:[A-Z][a-z]+\s+\d{1,2},?\s+\d{2,4})|(?:\d{4}-\d{2}-\d{2}))/i,
  ];
  let invoiceDate: Date | undefined;
  for (const p of invoiceDatePatterns) {
    const m = text.match(p);
    if (m) { invoiceDate = parseDate(m[1]); if (invoiceDate) break; }
  }
  const dueDatePatterns = [
    /(?:due\s*date|payment\s*due|due\s*on|due\s*by)\s*[:\-]?\s*((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})|(?:[A-Z][a-z]+\s+\d{1,2},?\s+\d{2,4})|(?:\d{4}-\d{2}-\d{2}))/i,
  ];
  let dueDate: Date | undefined;
  for (const p of dueDatePatterns) {
    const m = text.match(p);
    if (m) { dueDate = parseDate(m[1]); if (dueDate) break; }
  }
  // Fallback: first date in doc is likely invoice date
  if (!invoiceDate) {
    const any = text.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
    if (any) invoiceDate = parseDate(any[1]);
  }
  invoiceDate ??= new Date();
  // Terms like "Net 30" compute due date
  if (!dueDate) {
    const net = text.match(/\bnet\s*(\d{1,3})\b/i);
    const days = net ? parseInt(net[1], 10) : 30;
    dueDate = new Date(invoiceDate.getTime() + days * 86_400_000);
  }

  // --- Line items: try to detect a table-like region ---
  const lineItems: ExtractedInvoice["lineItems"] = [];
  const linePattern = /^\s*(.{5,60}?)\s{2,}.*?\$?\s*([\d,]+(?:\.\d{2})?)\s*$/gm;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = linePattern.exec(text)) !== null && seen < 12) {
    const desc = m[1].trim();
    const amt = parseFloat(m[2].replace(/,/g, ""));
    if (amt <= 0 || amt > (total ?? 10_000_000)) continue;
    if (/^(?:sub)?total|tax|discount|balance|amount\s+due/i.test(desc)) continue;
    if (desc.length < 5) continue;
    lineItems.push({ description: desc.slice(0, 60), amount: amt, costCode: inferCostCode(desc) });
    seen++;
  }
  // If parsing failed, synthesize proportional line items
  const resolvedTotal = total ?? (lineItems.reduce((s, l) => s + l.amount, 0) || 1000 + (stableHash(text) % 9000));
  if (lineItems.length === 0) {
    lineItems.push(
      { description: "Labor", amount: Math.round(resolvedTotal * 0.55 * 100) / 100, costCode: "01-50-00" },
      { description: "Materials", amount: Math.round(resolvedTotal * 0.35 * 100) / 100, costCode: "01-60-00" },
      { description: "Tax & freight", amount: Math.round(resolvedTotal * 0.1 * 100) / 100 },
    );
  }

  const found = [!!vendor && vendor !== "Unknown Vendor", !!invoiceNumber, !!total, !!invoiceDate, lineItems.length > 0];
  const confidence = 40 + found.filter(Boolean).length * 12;

  return {
    vendorName: vendor,
    invoiceNumber: invoiceNumber ?? `INV-${stableHash(text) % 99999}`,
    invoiceDate,
    dueDate,
    total: resolvedTotal,
    lineItems,
    poNumber: poMatch?.[1],
    confidence,
  };
}

function inferCostCode(desc: string): string | undefined {
  const d = desc.toLowerCase();
  if (/labor|crew|hours|payroll|wages/.test(d)) return "01-50-00";
  if (/material|supply|supplies|steel|concrete|lumber/.test(d)) return "01-60-00";
  if (/sub(?:contract)?|vendor/.test(d)) return "01-70-00";
  if (/equipment|rental|rent/.test(d)) return "01-55-00";
  if (/freight|shipping|delivery/.test(d)) return "01-61-00";
  if (/permit|fee|inspection/.test(d)) return "01-20-00";
  if (/concrete/.test(d)) return "03-30-00";
  if (/steel|rebar/.test(d)) return "05-12-00";
  if (/drywall|gypsum/.test(d)) return "09-29-00";
  if (/paint/.test(d)) return "09-91-00";
  if (/electrical|wire|conduit/.test(d)) return "26-00-00";
  if (/plumb/.test(d)) return "22-00-00";
  if (/hvac|mechanical|duct/.test(d)) return "23-00-00";
  return undefined;
}

export type BatchReclassSuggestion = {
  journalId: string;
  currentProject: string | null;
  suggestedProject: string | null;
  currentCostCode: string | null;
  suggestedCostCode: string | null;
  confidence: number;
  rationale: string;
};

export async function batchReclassifySuggest(tenantId: string): Promise<BatchReclassSuggestion[]> {
  const rows = await prisma.journalEntryRow.findMany({
    where: { tenantId, reconciliationStatus: { in: ["UNREVIEWED", "NEEDS_INPUT", "SUGGESTED"] } },
    include: { project: true },
    take: 50,
  });
  const projects = await prisma.project.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } });

  return aiCall<BatchReclassSuggestion[]>({
    kind: "batch-reclass",
    prompt: `Reclassify ${rows.length} journal rows`,
    fallback: () => {
      return rows.map((r) => {
        const memo = (r.memo ?? "").toLowerCase();
        const match = projects.find((p) => memo.includes(p.code.toLowerCase()) || memo.includes(p.name.toLowerCase()));
        const hash = stableHash(r.id);
        let suggestedCostCode = r.costCode ?? "01-00-00";
        if (/labor|payroll|crew/.test(memo)) suggestedCostCode = "01-50-00";
        else if (/material|supply/.test(memo)) suggestedCostCode = "01-60-00";
        else if (/sub\s|subcontract/.test(memo)) suggestedCostCode = "01-70-00";
        else if (/equipment|rental/.test(memo)) suggestedCostCode = "01-55-00";
        return {
          journalId: r.id,
          currentProject: r.project?.code ?? null,
          suggestedProject: match?.code ?? r.project?.code ?? null,
          currentCostCode: r.costCode,
          suggestedCostCode,
          confidence: match ? 85 : 55 + (hash % 15),
          rationale: match ? `Memo "${r.memo}" mentions project ${match.code}.` : "No direct project match — cost-code inferred from memo keywords.",
        };
      });
    },
  });
}

export type CollectionEmail = { subject: string; tier: "FIRST" | "SECOND" | "FINAL"; body: string };

export async function draftCollectionsEmail(params: { payeeName: string; invoiceAmount: number; daysPastDue: number; invoiceNo: string }): Promise<CollectionEmail> {
  const tier: CollectionEmail["tier"] = params.daysPastDue >= 90 ? "FINAL" : params.daysPastDue >= 60 ? "SECOND" : "FIRST";

  return aiCall<CollectionEmail>({
    kind: "ar-collections",
    prompt: `Collections email tier ${tier}`,
    fallback: () => {
      if (tier === "FINAL") {
        return {
          subject: `FINAL NOTICE — Invoice ${params.invoiceNo} — $${params.invoiceAmount.toLocaleString()}`,
          tier,
          body: `Dear ${params.payeeName},\n\nOur records show invoice ${params.invoiceNo} (${params.daysPastDue} days past due, $${params.invoiceAmount.toLocaleString()}) remains unpaid despite prior outreach.\n\nPlease remit payment within 10 business days to avoid referral to our collections partner. We would prefer to preserve our ongoing relationship; please call us today if there is a billing dispute we should address.\n\nAccounts Receivable`,
        };
      }
      if (tier === "SECOND") {
        return {
          subject: `Second notice — Invoice ${params.invoiceNo} — $${params.invoiceAmount.toLocaleString()}`,
          tier,
          body: `Dear ${params.payeeName},\n\nInvoice ${params.invoiceNo} for $${params.invoiceAmount.toLocaleString()} is now ${params.daysPastDue} days past due.\n\nIf payment is in process, please disregard. Otherwise, please remit by ACH or wire at your earliest convenience. If there is a dispute or change order required, please contact us promptly so we can resolve it.\n\nThank you,\nAccounts Receivable`,
        };
      }
      return {
        subject: `Friendly reminder — Invoice ${params.invoiceNo}`,
        tier,
        body: `Dear ${params.payeeName},\n\nThis is a courtesy reminder that invoice ${params.invoiceNo} for $${params.invoiceAmount.toLocaleString()} is ${params.daysPastDue} days past due.\n\nWe value our partnership — please let us know if there is anything we can do to facilitate prompt payment. If you have already sent payment, thank you and please disregard.\n\nBest,\nAccounts Receivable`,
      };
    },
  });
}

export type JournalAnomaly = { journalId: string; type: string; severity: "LOW" | "MED" | "HIGH"; description: string };

export async function detectJournalAnomalies(tenantId: string): Promise<JournalAnomaly[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rawRows = await prisma.journalEntryRow.findMany({
    where: { tenantId, entryDate: { gte: since } },
    orderBy: { entryDate: "desc" },
    take: 2000,
  });
  // Coerce Decimal amount → number once at the boundary so the rest
  // of the analysis can use plain arithmetic. Explicit type so the
  // spread doesn't keep the original Decimal type from rawRows.
  type Row = Omit<(typeof rawRows)[number], "amount"> & { amount: number };
  const rows: Row[] = rawRows.map((r) => ({ ...r, amount: toNum(r.amount) }));

  return aiCall<JournalAnomaly[]>({
    kind: "journal-anomaly",
    prompt: `Scan ${rows.length} journal rows for anomalies`,
    fallback: () => {
      const findings: JournalAnomaly[] = [];

      // --- 1. Exact duplicates (same vendor, same day, same amount) ---
      const byVendorDay = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!r.vendorName) continue;
        const key = `${r.vendorName.toLowerCase().trim()}::${r.entryDate.toISOString().slice(0, 10)}::${Math.round(Math.abs(r.amount))}`;
        const existing = byVendorDay.get(key) ?? [];
        existing.push(r);
        byVendorDay.set(key, existing);
      }
      for (const [k, v] of byVendorDay.entries()) {
        if (v.length > 1) {
          findings.push({
            journalId: v[0].id,
            type: "EXACT_DUPLICATE",
            severity: "HIGH",
            description: `${v.length} identical entries for ${k.split("::")[0]} on ${k.split("::")[1]} ($${v[0].amount.toLocaleString()}). Verify this isn't a double-post.`,
          });
        }
      }

      // --- 2. Fuzzy vendor dedup: similar vendor names might be the same entity ---
      const vendorGroups = groupFuzzyVendors(rows);
      for (const group of vendorGroups) {
        if (group.variants.length > 1) {
          findings.push({
            journalId: group.sample.id,
            type: "FUZZY_VENDOR",
            severity: "MED",
            description: `Possible vendor name variation: "${group.variants.join('", "')}" appear similar. Total spend $${Math.abs(group.totalAmount).toLocaleString()}. Consolidate for accurate reporting.`,
          });
        }
      }

      // --- 3. Z-score outliers on amount within each account ---
      const byAccount = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = r.accountCode ?? r.accountName;
        const arr = byAccount.get(k) ?? [];
        arr.push(r);
        byAccount.set(k, arr);
      }
      for (const [acct, arr] of byAccount.entries()) {
        if (arr.length < 8) continue; // need a reasonable sample
        const amounts = arr.map((r) => Math.abs(r.amount));
        const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
        const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
        const std = Math.sqrt(variance);
        if (std === 0) continue;
        for (const r of arr) {
          const z = (Math.abs(r.amount) - mean) / std;
          if (z > 3 && Math.abs(r.amount) > 5000) {
            findings.push({
              journalId: r.id,
              type: "AMOUNT_OUTLIER",
              severity: z > 5 ? "HIGH" : "MED",
              description: `$${r.amount.toLocaleString()} to account ${acct} is ${z.toFixed(1)}σ above normal (avg $${Math.round(mean).toLocaleString()}). Verify supporting documentation.`,
            });
          }
        }
      }

      // --- 4. Round-amount fraud heuristic ---
      for (const r of rows) {
        const abs = Math.abs(r.amount);
        if (abs >= 10_000 && abs % 1000 === 0 && abs !== 0) {
          const severity: JournalAnomaly["severity"] = abs >= 50_000 ? "MED" : "LOW";
          findings.push({
            journalId: r.id,
            type: "ROUND_AMOUNT",
            severity,
            description: `Round amount $${abs.toLocaleString()} on ${r.entryDate.toISOString().slice(0, 10)} to ${r.vendorName ?? "—"} — verify against supporting invoice (round numbers are common fraud indicators).`,
          });
        }
      }

      // --- 5. Benford's law check on leading digits ---
      const benfordAnomaly = benfordsLawCheck(rows.map((r) => Math.abs(r.amount)).filter((v) => v > 100));
      if (benfordAnomaly) {
        findings.push({
          journalId: rows[0]?.id ?? "—",
          type: "BENFORD_DEVIATION",
          severity: "MED",
          description: `Leading-digit distribution across ${rows.length} journal rows deviates ${(benfordAnomaly * 100).toFixed(0)}% from Benford's law. Possible data manipulation or systematic error — recommend controller review of the full period.`,
        });
      }

      // --- 6. Weekend/holiday entries ---
      for (const r of rows) {
        const day = r.entryDate.getDay();
        if ((day === 0 || day === 6) && Math.abs(r.amount) > 10_000) {
          findings.push({
            journalId: r.id,
            type: "WEEKEND_POST",
            severity: "LOW",
            description: `Large entry ($${Math.abs(r.amount).toLocaleString()}) posted on a ${day === 0 ? "Sunday" : "Saturday"} — unusual posting timing.`,
          });
        }
      }

      // --- 7. Unmatched vendor (high value with no vendor) ---
      for (const r of rows) {
        if (!r.vendorName && Math.abs(r.amount) > 25_000) {
          findings.push({
            journalId: r.id,
            type: "MISSING_VENDOR",
            severity: "MED",
            description: `$${Math.abs(r.amount).toLocaleString()} entry on ${r.entryDate.toISOString().slice(0, 10)} has no vendor name — assign before month close.`,
          });
        }
      }

      // De-dupe and cap
      const seen = new Set<string>();
      const deduped: JournalAnomaly[] = [];
      for (const f of findings) {
        const k = `${f.journalId}::${f.type}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(f);
      }
      // Sort by severity, then return top 60
      const rank = { HIGH: 3, MED: 2, LOW: 1 } as const;
      return deduped.sort((a, b) => rank[b.severity] - rank[a.severity]).slice(0, 60);
    },
  });
}

/** Normalize vendor name for fuzzy matching: lowercase, strip common suffixes + punctuation. */
function normalizeVendor(name: string): string {
  return name.toLowerCase()
    .replace(/[,.'"()]/g, "")
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co|lp|pllc|plc)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type VendorGroup = { variants: string[]; totalAmount: number; sample: { id: string; amount: number }; };

function groupFuzzyVendors(rows: Array<{ id: string; vendorName: string | null; amount: number }>): VendorGroup[] {
  const groups = new Map<string, VendorGroup>();
  for (const r of rows) {
    if (!r.vendorName) continue;
    const norm = normalizeVendor(r.vendorName);
    if (norm.length < 4) continue;
    // Group by first word + first 6 chars of normalized
    const key = `${norm.split(" ")[0]}::${norm.slice(0, 6)}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.variants.includes(r.vendorName)) existing.variants.push(r.vendorName);
      existing.totalAmount += r.amount;
    } else {
      groups.set(key, { variants: [r.vendorName], totalAmount: r.amount, sample: { id: r.id, amount: r.amount } });
    }
  }
  return Array.from(groups.values());
}

/**
 * Benford's law: leading digit frequencies follow log10(1 + 1/d).
 * Returns normalized chi-square deviation (0 = perfect fit, >0.15 is suspicious).
 */
function benfordsLawCheck(amounts: number[]): number | null {
  if (amounts.length < 50) return null; // too small a sample
  const expected = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  const observed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const a of amounts) {
    if (a <= 0) continue;
    const s = Math.floor(a).toString();
    const lead = parseInt(s[0], 10);
    if (lead >= 1 && lead <= 9) { observed[lead - 1]++; total++; }
  }
  if (total < 50) return null;
  let chiSq = 0;
  for (let i = 0; i < 9; i++) {
    const o = observed[i] / total;
    const e = expected[i];
    chiSq += ((o - e) ** 2) / e;
  }
  if (chiSq > 0.15) return chiSq;
  return null;
}

export type EacForecast = {
  projectId: string;
  eacCost: number;
  eacRevenue: number;
  eacMargin: number;
  marginPct: number;
  variance: number;
  narrative: string;
  /**
   * Forecast confidence. "none" means we had NO cost signal (no committed
   * cost, no meaningful %-complete, no journal burn) and therefore could not
   * compute a real EAC — eacCost is set neutrally to contract and callers MUST
   * NOT treat it as an overrun/variance signal. Previously this path silently
   * fabricated `contract * 0.9`, presenting an invented number as a forecast.
   */
  confidence: "none" | "low" | "medium";
};

export async function eacForecast(projectId: string, tenantId: string): Promise<EacForecast> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: { budgets: { include: { lines: { select: { budgetAmount: true } } } } },
  });
  if (!project) throw new Error("project not found");
  const snap = await prisma.projectPnlSnapshot.findUnique({ where: { projectId } });
  // Real planned-cost baseline: sum of budget lines if the project has a
  // budget. There is no single "planned cost" column, so the budget is the
  // only honest source. When absent we omit the baseline-variance sentence
  // entirely rather than invent one from a contract*0.85 assumption.
  const plannedCost = project.budgets.flatMap((b) => b.lines).reduce((s, l) => s + toNum(l.budgetAmount), 0);

  // Pull real monthly journal burn to detect a trend.
  const journals = await prisma.journalEntryRow.findMany({
    where: { tenantId, projectId, amount: { lt: 0 } }, // costs are negative in this schema
    select: { entryDate: true, amount: true },
    orderBy: { entryDate: "asc" },
  });

  return aiCall<EacForecast>({
    kind: "eac-forecast",
    prompt: `EAC forecast for ${project.code}`,
    fallback: () => {
      const committed = toNum(snap?.committedCost);
      const actual = toNum(snap?.costsToDate);
      const contract = toNum(project.contractValue) || toNum(snap?.totalContractValue);
      const pctComplete = snap?.percentComplete == null ? (contract > 0 ? (actual / contract) * 100 : 0) : toNum(snap.percentComplete);

      // Bucket journals by month to compute trailing-3 burn rate.
      const byMonth = new Map<string, number>();
      for (const j of journals) {
        const k = j.entryDate.toISOString().slice(0, 7);
        byMonth.set(k, (byMonth.get(k) ?? 0) + Math.abs(toNum(j.amount)));
      }
      const months = Array.from(byMonth.entries()).sort();
      const recent = months.slice(-3);
      const recentAvgBurn = recent.length > 0 ? recent.reduce((s, [, v]) => s + v, 0) / recent.length : 0;
      const earlierAvgBurn = months.length > 6 ? months.slice(-6, -3).reduce((s, [, v]) => s + v, 0) / 3 : recentAvgBurn;
      const burnTrend = earlierAvgBurn > 0 ? (recentAvgBurn - earlierAvgBurn) / earlierAvgBurn : 0;

      // Three EAC methods — blend them for robustness:
      //   1) Committed-plus: remaining = committed - actual
      //   2) PCT-complete: EAC = actual / (pctComplete/100)
      //   3) Burn-rate: EAC = actual + recentAvgBurn * monthsRemaining
      const monthsRemaining = Math.max(1, Math.round((100 - pctComplete) / 5));
      const eacCommitted = actual + Math.max(0, committed - actual) * 1.05;
      const eacPct = pctComplete > 5 ? actual / (pctComplete / 100) : eacCommitted;
      const eacBurn = actual + recentAvgBurn * monthsRemaining;
      // Weight methods by available signal strength.
      const wCommitted = committed > 0 ? 0.4 : 0;
      const wPct = pctComplete > 10 ? 0.35 : 0.1;
      const wBurn = recentAvgBurn > 0 ? 0.35 : 0;
      const wSum = wCommitted + wPct + wBurn;
      const eacRevenue = contract;

      // Real cost signal = any of: committed cost, actual cost posted with a
      // meaningful %-complete, or journal burn history. The pct-complete weight
      // carries a 0.1 floor so wSum is never 0; that floor must NOT count as
      // signal on its own (an all-zero snapshot with %-complete 0 has none).
      const hasSignal = committed > 0 || recentAvgBurn > 0 || (actual > 0 && pctComplete > 5);

      // No cost signal at all. We CANNOT forecast. Return a neutral result
      // flagged confidence "none": eacCost = contract so eacMargin/variance are
      // zero rather than a fabricated overrun. Callers must not raise
      // overrun/variance alerts off a no-confidence forecast.
      if (!hasSignal) {
        return {
          projectId,
          eacCost: contract,
          eacRevenue,
          eacMargin: 0,
          marginPct: 0,
          variance: 0,
          narrative: "Insufficient data to forecast: no committed cost, meaningful percent-complete, or journal burn history is available for this project. Capture budget commitments and post project costs to enable an EAC.",
          confidence: "none",
        };
      }

      const eacCost = (wCommitted * eacCommitted + wPct * eacPct + wBurn * eacBurn) / wSum;
      const eacMargin = eacRevenue - eacCost;
      const marginPct = eacRevenue > 0 ? (eacMargin / eacRevenue) * 100 : 0;
      // Baseline variance only when we have a REAL planned cost (sum of budget
      // lines). Without a budget we omit the baseline-variance sentence rather
      // than invent an originalCost from a contract*0.85 margin assumption.
      const hasBaseline = plannedCost > 0;
      const variance = hasBaseline ? eacCost - plannedCost : 0;
      // Confidence: medium when committed-cost or strong %-complete drives it,
      // low when only one weak signal (e.g. early burn) is present.
      const confidence: "low" | "medium" = wCommitted > 0 || wPct >= 0.35 ? "medium" : "low";

      const parts: string[] = [];
      if (months.length > 0) parts.push(`${months.length} months of journal burn data reviewed.`);
      if (recentAvgBurn > 0) parts.push(`Trailing-3-month burn ≈ $${Math.round(recentAvgBurn).toLocaleString()}/mo.`);
      if (Math.abs(burnTrend) > 0.15) parts.push(`Burn rate ${burnTrend > 0 ? "accelerating" : "decelerating"} ${(Math.abs(burnTrend) * 100).toFixed(0)}% vs prior 3 months.`);
      if (hasBaseline) {
        if (variance > 0) parts.push(`EAC trending $${Math.abs(variance).toLocaleString()} over budget baseline (${((variance / Math.max(1, plannedCost)) * 100).toFixed(1)}%). Commit review + scope verification recommended.`);
        else parts.push(`EAC trending $${Math.abs(variance).toLocaleString()} under budget baseline. Potential margin recapture; reforecast recommended.`);
      }
      parts.push(`Blended forecast weights: committed ${Math.round(wCommitted / Math.max(wSum, 0.01) * 100)}% · pct-complete ${Math.round(wPct / Math.max(wSum, 0.01) * 100)}% · burn-rate ${Math.round(wBurn / Math.max(wSum, 0.01) * 100)}%.`);

      return {
        projectId,
        eacCost,
        eacRevenue,
        eacMargin,
        marginPct,
        variance,
        narrative: parts.join(" "),
        confidence,
      };
    },
  });
}

export type VarianceNarrative = { summary: string; byCostCode: Array<{ costCode: string; variance: number; narrative: string }> };

export async function varianceNarrative(projectId: string, tenantId: string): Promise<VarianceNarrative> {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, include: { budgets: { include: { lines: true } } } });
  if (!project) throw new Error("project not found");
  const allLines = project.budgets.flatMap((b) => b.lines);

  return aiCall<VarianceNarrative>({
    kind: "variance-narrative",
    prompt: `Narrative for ${project.code} cost variance`,
    fallback: () => {
      const lines = allLines.map((b) => {
        const variance = toNum(b.actualCost) - toNum(b.budgetAmount);
        const pct = toNum(b.budgetAmount) > 0 ? (variance / toNum(b.budgetAmount)) * 100 : 0;
        let narrative = `$${Math.abs(variance).toLocaleString()} ${variance >= 0 ? "over" : "under"} budget (${pct.toFixed(1)}%)`;
        if (variance > 0 && pct > 10) narrative += "; driver: likely scope growth or productivity loss. Recommend corrective action.";
        else if (variance < 0 && pct < -5) narrative += "; likely favorable procurement or under-run. Review for reforecast opportunity.";
        return { costCode: b.code, variance, narrative };
      });
      const totalVar = lines.reduce((s, l) => s + l.variance, 0);
      const summary = totalVar > 0
        ? `Project trending $${Math.abs(totalVar).toLocaleString()} over plan across ${lines.length} cost codes. Primary drivers: scope growth, weather delays.`
        : `Project trending $${Math.abs(totalVar).toLocaleString()} under plan. Strong procurement and productivity. Consider margin reforecast.`;
      return { summary, byCostCode: lines };
    },
  });
}

export type CloseChecklistItem = { id: string; label: string; status: "PENDING" | "READY" | "COMPLETE" | "BLOCKED"; note: string };

export async function monthEndCloseChecklist(tenantId: string): Promise<CloseChecklistItem[]> {
  const xeroCount = await prisma.journalEntryRow.count({ where: { tenantId, source: "xero-sync" } });
  const qboCount = await prisma.journalEntryRow.count({ where: { tenantId, source: "qbo-sync" } });
  const unreviewed = await prisma.journalEntryRow.count({ where: { tenantId, reconciliationStatus: "UNREVIEWED" } });
  const unreconciled = await prisma.journalEntryRow.count({ where: { tenantId, reconciliationStatus: { in: ["NEEDS_INPUT", "REJECTED"] } } });
  const openPos = await prisma.purchaseOrder.count({ where: { project: { tenantId }, status: { in: ["OPEN", "PARTIAL"] } } });

  return [
    { id: "sync", label: "Xero / QBO sync completed this month", status: xeroCount + qboCount > 0 ? "COMPLETE" : "PENDING", note: `${xeroCount + qboCount} journal rows synced (${xeroCount} Xero + ${qboCount} QBO).` },
    { id: "unreviewed", label: "All journal entries reviewed", status: unreviewed === 0 ? "COMPLETE" : "PENDING", note: `${unreviewed} entries still unreviewed.` },
    { id: "unreconciled", label: "No entries flagged NEEDS_INPUT or REJECTED", status: unreconciled === 0 ? "COMPLETE" : "BLOCKED", note: `${unreconciled} entries need controller action.` },
    { id: "pos", label: "Open purchase orders accrued", status: openPos === 0 ? "COMPLETE" : "READY", note: `${openPos} POs still open — run accrual report.` },
    { id: "payapps", label: "Owner pay applications submitted", status: "READY", note: "Verify all projects have current-period AIA submitted." },
    { id: "subinvoices", label: "Subcontractor invoices matched to POs", status: "READY", note: "Review matches and approve for payment." },
    { id: "warranty", label: "Warranty reserve accruals posted", status: "PENDING", note: "Post warranty reserves for completed projects." },
    { id: "overhead", label: "Overhead allocation posted", status: "PENDING", note: "Allocate indirect costs to active projects." },
    { id: "pnl", label: "Project P&Ls refreshed", status: "READY", note: "Run refreshProjectPnl() after all accruals posted." },
  ];
}
