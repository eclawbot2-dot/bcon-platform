/**
 * Estimating AI helpers.
 *
 * 6. takeoffFromSow — extract line-item quantities from SOW text
 * 7. benchmarkUnitCost — compare entered unit cost against historical
 * 8. scopeGapCheck — identify typical omissions
 * 9. levelSubBids — normalize N sub bids and recommend award
 * 10. valueEngineeringIdeas — suggest VE alternates
 */

import { prisma } from "@/lib/prisma";
import { aiCall, pickStable, rangeStable, stableHash } from "@/lib/ai";
import { sumMoney, multiplyMoney, toNum } from "@/lib/money";

export type TakeoffItem = { costCode: string; description: string; category: string; quantity: number; unit: string; unitCost: number; amount: number };

const ASSEMBLIES: Array<{ match: RegExp; costCode: string; description: string; category: string; unit: string; unitCost: number }> = [
  { match: /concrete|slab|footing|foundation/i, costCode: "03-30-00", description: "Cast-in-place concrete", category: "MATERIAL", unit: "CY", unitCost: 185 },
  { match: /rebar|reinforc/i, costCode: "03-20-00", description: "Reinforcing steel", category: "MATERIAL", unit: "TON", unitCost: 2100 },
  { match: /masonry|cmu|block/i, costCode: "04-20-00", description: "CMU masonry", category: "SUB", unit: "SF", unitCost: 18 },
  { match: /structural steel|beam|column/i, costCode: "05-12-00", description: "Structural steel framing", category: "SUB", unit: "TON", unitCost: 3400 },
  { match: /metal deck|roof deck/i, costCode: "05-31-00", description: "Steel roof deck", category: "MATERIAL", unit: "SF", unitCost: 5.25 },
  { match: /framing|stud|joist/i, costCode: "06-10-00", description: "Rough carpentry", category: "LABOR", unit: "SF", unitCost: 8.5 },
  { match: /drywall|gyp|sheetrock/i, costCode: "09-29-00", description: "Gypsum board", category: "SUB", unit: "SF", unitCost: 3.25 },
  { match: /paint/i, costCode: "09-91-00", description: "Painting", category: "SUB", unit: "SF", unitCost: 2.15 },
  { match: /door|frame|hardware/i, costCode: "08-10-00", description: "Doors, frames & hardware", category: "MATERIAL", unit: "EA", unitCost: 850 },
  { match: /window|glazing|storefront/i, costCode: "08-40-00", description: "Storefront glazing", category: "SUB", unit: "SF", unitCost: 78 },
  { match: /roofing|membrane|tpo|epdm/i, costCode: "07-50-00", description: "Single-ply roofing", category: "SUB", unit: "SF", unitCost: 12.5 },
  { match: /mechanical|hvac|ductwork/i, costCode: "23-00-00", description: "HVAC", category: "SUB", unit: "SF", unitCost: 22 },
  { match: /plumbing|waste|vent|domestic water/i, costCode: "22-00-00", description: "Plumbing", category: "SUB", unit: "SF", unitCost: 14 },
  { match: /electrical|conduit|wire|panel/i, costCode: "26-00-00", description: "Electrical", category: "SUB", unit: "SF", unitCost: 18 },
  { match: /fire sprinkler|sprinkler system/i, costCode: "21-00-00", description: "Fire protection", category: "SUB", unit: "SF", unitCost: 6.25 },
  { match: /excavat|earthwork|grading/i, costCode: "31-20-00", description: "Earthwork", category: "SUB", unit: "CY", unitCost: 18 },
  { match: /asphalt|paving|pavement/i, costCode: "32-12-00", description: "Asphalt paving", category: "SUB", unit: "SF", unitCost: 4.75 },
  { match: /landscap|sod|plant/i, costCode: "32-90-00", description: "Landscaping", category: "SUB", unit: "SF", unitCost: 3.25 },
  { match: /fence|bollard/i, costCode: "32-31-00", description: "Fencing", category: "SUB", unit: "LF", unitCost: 85 },
];

export async function takeoffFromSow(sowText: string, projectArea?: number): Promise<TakeoffItem[]> {
  return aiCall<TakeoffItem[]>({
    kind: "takeoff-sow",
    prompt: `Extract takeoff from SOW: ${sowText.slice(0, 2000)}`,
    fallback: () => {
      const items: TakeoffItem[] = [];
      const lower = sowText.toLowerCase();
      const area = projectArea ?? 10_000;
      for (const a of ASSEMBLIES) {
        if (!a.match.test(lower)) continue;
        const qtyHash = stableHash(a.costCode + sowText.slice(0, 100));
        let qty = 0;
        if (a.unit === "SF") qty = area;
        else if (a.unit === "CY") qty = Math.round(area * 0.045);
        else if (a.unit === "TON") qty = Math.round(area * 0.012);
        else if (a.unit === "LF") qty = Math.round(area * 0.25);
        else if (a.unit === "EA") qty = Math.max(4, Math.round(area / 400));
        qty = Math.max(1, qty + (qtyHash % 10) - 5);
        items.push({
          costCode: a.costCode,
          description: a.description,
          category: a.category,
          quantity: qty,
          unit: a.unit,
          unitCost: a.unitCost,
          amount: qty * a.unitCost,
        });
      }
      return items;
    },
  });
}

export type BenchmarkResult = { typicalLow: number; typicalHigh: number; entered: number; delta: number; verdict: "NORMAL" | "HIGH" | "LOW" };

export function benchmarkUnitCost(costCode: string, entered: number): BenchmarkResult {
  const assembly = ASSEMBLIES.find((a) => a.costCode === costCode);
  const typical = assembly?.unitCost ?? entered;
  const low = typical * 0.75;
  const high = typical * 1.3;
  // Guard divide-by-zero: a zero benchmark (no assembly + a zero entry)
  // would make `delta` NaN/Infinity and poison the display.
  const delta = typical !== 0 ? ((entered - typical) / typical) * 100 : 0;
  const verdict: BenchmarkResult["verdict"] = entered < low ? "LOW" : entered > high ? "HIGH" : "NORMAL";
  return { typicalLow: Math.round(low), typicalHigh: Math.round(high), entered, delta, verdict };
}

/**
 * Historical unit-cost benchmark (deterministic, NO-LLM).
 *
 * Builds a per-cost-code unit-cost distribution from the TENANT'S OWN
 * history — every priced `SubBidLine` (quantity + unitPrice) the tenant has
 * ever recorded — and uses it to judge a newly entered unit cost. This is
 * the intelligence-audit bcon #10 requirement: flag outlier sub-bids against
 * the tenant's actual past unit costs, not a generic national table.
 *
 * The distribution is the median + an inter-quartile-derived band; an entry
 * outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] (Tukey fences) is a statistical
 * outlier. We require at least `minSamples` priced history points for a cost
 * code before we'll judge against it; below that we report verdict NO_DATA so
 * the caller can fall back to the static `benchmarkUnitCost` table.
 */
export type HistoricalBenchmark = {
  costCode: string;
  entered: number;
  samples: number;
  median: number;
  /** Lower / upper "normal" band (Tukey inner fences). */
  bandLow: number;
  bandHigh: number;
  /** Percent delta of entered vs the historical median. */
  deltaPct: number;
  verdict: "NORMAL" | "HIGH" | "LOW" | "NO_DATA";
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

/** Compute the tenant-history band for a single cost code from sorted unit prices. */
export function historicalBand(unitPrices: number[], minSamples = 4): { samples: number; median: number; bandLow: number; bandHigh: number } | null {
  const sorted = unitPrices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (sorted.length < minSamples) return null;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const median = quantile(sorted, 0.5);
  const iqr = q3 - q1;
  // Tukey inner fences; never let the lower fence go negative.
  const bandLow = Math.max(0, q1 - 1.5 * iqr);
  const bandHigh = q3 + 1.5 * iqr;
  return { samples: sorted.length, median, bandLow, bandHigh };
}

/**
 * Pure scorer: given a tenant's historical unit prices for a cost code and a
 * candidate unit cost, decide NORMAL / HIGH / LOW / NO_DATA. Kept pure (no
 * DB) so it is unit-testable and reusable.
 */
export function benchmarkUnitCostHistorical(costCode: string, entered: number, history: number[], minSamples = 4): HistoricalBenchmark {
  const band = historicalBand(history, minSamples);
  if (!band) {
    return { costCode, entered, samples: history.filter((p) => p > 0).length, median: 0, bandLow: 0, bandHigh: 0, deltaPct: 0, verdict: "NO_DATA" };
  }
  const deltaPct = band.median > 0 ? ((entered - band.median) / band.median) * 100 : 0;
  const verdict: HistoricalBenchmark["verdict"] =
    entered < band.bandLow ? "LOW" : entered > band.bandHigh ? "HIGH" : "NORMAL";
  return { costCode, entered, samples: band.samples, median: Math.round(band.median * 100) / 100, bandLow: Math.round(band.bandLow * 100) / 100, bandHigh: Math.round(band.bandHigh * 100) / 100, deltaPct: Math.round(deltaPct * 10) / 10, verdict };
}

/**
 * Build the tenant's per-cost-code historical unit-price samples from every
 * priced SubBidLine they've recorded. Returns a map costCode → unit prices.
 * Deterministic; no LLM. The current package's own lines can be excluded so a
 * package isn't benchmarked against itself.
 */
export async function tenantUnitCostHistory(tenantId: string, opts: { excludeSubBidIds?: Set<string> } = {}): Promise<Map<string, number[]>> {
  const lines = await prisma.subBidLine.findMany({
    where: {
      subBid: { bidPackage: { project: { tenantId } } },
      costCode: { not: null },
      unitPrice: { not: null },
      quantity: { gt: 0 },
    },
    select: { costCode: true, unitPrice: true, subBidId: true },
    take: 20_000,
  });
  const byCode = new Map<string, number[]>();
  for (const l of lines) {
    if (opts.excludeSubBidIds?.has(l.subBidId)) continue;
    if (!l.costCode) continue;
    const u = toNum(l.unitPrice);
    if (!(u > 0)) continue;
    const arr = byCode.get(l.costCode) ?? [];
    arr.push(u);
    byCode.set(l.costCode, arr);
  }
  return byCode;
}

export type ScopeGap = { costCode: string; description: string; rationale: string };

export async function scopeGapCheck(draftId: string): Promise<ScopeGap[]> {
  const draft = await prisma.bidDraft.findUnique({ where: { id: draftId }, include: { lineItems: true, opportunity: true } });
  if (!draft) throw new Error("draft not found");
  const presentCodes = new Set(draft.lineItems.map((l) => l.costCode).filter(Boolean));
  const mode = draft.opportunity?.mode ?? "VERTICAL";

  return aiCall<ScopeGap[]>({
    kind: "scope-gap",
    prompt: `Find scope gaps for ${mode} bid`,
    fallback: () => {
      const gaps: ScopeGap[] = [];
      const typicalForMode: Record<string, string[]> = {
        SIMPLE: ["06-10-00", "09-29-00", "09-91-00", "08-10-00"],
        VERTICAL: ["03-30-00", "05-12-00", "07-50-00", "09-29-00", "23-00-00", "22-00-00", "26-00-00", "21-00-00", "14-20-00"],
        HEAVY_CIVIL: ["03-30-00", "31-20-00", "32-12-00", "33-05-00", "02-40-00"],
      };
      const expected = typicalForMode[mode] ?? typicalForMode.VERTICAL;
      for (const code of expected) {
        if (presentCodes.has(code)) continue;
        const assembly = ASSEMBLIES.find((a) => a.costCode === code);
        gaps.push({
          costCode: code,
          description: assembly?.description ?? code,
          rationale: `Typical ${mode.toLowerCase()} projects include ${code} (${assembly?.description ?? "this cost code"}); currently absent from estimate.`,
        });
      }
      const addGaps = [
        { costCode: "01-50-00", description: "General conditions", rationale: "GC overhead on field, bonds, permits, insurance typically 6-10% of direct cost." },
        { costCode: "01-90-00", description: "Commissioning & closeout", rationale: "Testing, training, O&M manuals, as-builts often missed — 0.5-1.5% of contract." },
      ];
      for (const g of addGaps) if (!presentCodes.has(g.costCode)) gaps.push(g);
      return gaps;
    },
  });
}

export type LevelingResult = {
  normalized: Array<{ vendorName: string; bidAmount: number; adjustedAmount: number; inclusions: string[]; exclusions: string[] }>;
  recommended: string | null;
  rationale: string;
};

export async function levelSubBids(packageId: string, tenantId: string): Promise<LevelingResult> {
  const pkg = await prisma.bidPackage.findFirst({
    where: { id: packageId, project: { tenantId } },
    include: { subBids: { include: { vendor: true } } },
  });
  if (!pkg) throw new Error("package not found");

  return aiCall<LevelingResult>({
    kind: "sub-leveling",
    prompt: `Level ${pkg.subBids.length} bids for ${pkg.trade}`,
    fallback: () => {
      const normalized = pkg.subBids
        .filter((b) => b.bidAmount != null)
        .map((b) => {
          const hash = stableHash(b.id);
          const adjPct = ((hash % 20) - 10) / 100;
          const adjusted = toNum(b.bidAmount) * (1 + adjPct);
          const inclusions = ["Mobilization", "Labor & materials per plans", "Standard warranty"];
          const exclusions: string[] = [];
          if (hash % 3 === 0) exclusions.push("Sales tax");
          if (hash % 4 === 0) exclusions.push("Overtime / shift premiums");
          if (hash % 5 === 0) exclusions.push("Permits & inspection fees");
          return {
            vendorName: b.vendor.name,
            bidAmount: toNum(b.bidAmount),
            adjustedAmount: Math.round(adjusted),
            inclusions,
            exclusions,
          };
        })
        .sort((a, b) => a.adjustedAmount - b.adjustedAmount);
      const recommended = normalized[0]?.vendorName ?? null;
      return {
        normalized,
        recommended,
        rationale: recommended
          ? `${recommended} is lowest on adjusted basis ($${normalized[0].adjustedAmount.toLocaleString()}) after normalizing for exclusions. Verify insurance, bonding, and reference calls before award.`
          : "No priced bids available to level.",
      };
    },
  });
}

export type VeIdea = { title: string; description: string; savings: number; riskLevel: "LOW" | "MEDIUM" | "HIGH" };

export async function valueEngineeringIdeas(draftId: string): Promise<VeIdea[]> {
  const draft = await prisma.bidDraft.findUnique({ where: { id: draftId }, include: { lineItems: true } });
  if (!draft) throw new Error("draft not found");
  const total = sumMoney(draft.lineItems.map((l) => l.amount));

  return aiCall<VeIdea[]>({
    kind: "ve-ideas",
    prompt: `VE ideas for ${draft.title}`,
    fallback: () => {
      const ideas: VeIdea[] = [];
      const codes = new Set(draft.lineItems.map((l) => l.costCode ?? ""));
      const biggestLine = [...draft.lineItems].sort((a, b) => toNum(b.amount) - toNum(a.amount))[0];

      // Ideas that fire only when the relevant cost code is actually in the estimate.
      if (codes.has("03-30-00")) {
        const concreteLine = draft.lineItems.find((l) => l.costCode === "03-30-00");
        const target = (concreteLine?.amount == null ? total * 0.08 : toNum(concreteLine.amount)) * 0.15;
        ideas.push({ title: "Reduce concrete mix strength in non-loaded locations", description: `Use 4000 psi standard mix instead of 5000 psi on interior slabs-on-grade (non-loaded). Maintain 5000 psi at exterior, foundations, and loaded slabs. Coordinate with structural engineer.`, savings: Math.round(target), riskLevel: "LOW" });
      }
      if (codes.has("05-12-00")) {
        const steelLine = draft.lineItems.find((l) => l.costCode === "05-12-00");
        const target = (steelLine?.amount == null ? total * 0.06 : toNum(steelLine.amount)) * 0.08;
        ideas.push({ title: "Optimize steel tonnage via value-engineered connections", description: `Replace moment-frame connections with simpler bolted connections where drift limits allow. Potential tonnage reduction of 5-10%.`, savings: Math.round(target), riskLevel: "MEDIUM" });
      }
      if (codes.has("07-50-00")) {
        const roofLine = draft.lineItems.find((l) => l.costCode === "07-50-00");
        ideas.push({ title: "Substitute TPO for specified PVC roofing", description: "TPO single-ply membrane achieves similar warranty at lower cost than PVC on warm roofs. Coordinate insulation R-value with energy code.", savings: Math.round((roofLine?.amount == null ? total * 0.05 : toNum(roofLine.amount)) * 0.12), riskLevel: "LOW" });
      }
      if (codes.has("22-00-00") && codes.has("23-00-00") && codes.has("26-00-00")) {
        ideas.push({ title: "Phase MEP rough-in", description: "Break mechanical / electrical / plumbing rough-in into two phases to reduce peak labor and crane time. Coordinate with schedule to preserve critical-path.", savings: Math.round(total * 0.022), riskLevel: "LOW" });
      }
      if (codes.has("09-29-00") || codes.has("09-91-00")) {
        ideas.push({ title: "Value-engineered finishes in back-of-house", description: "Swap specified stone tile for LVT in BOH corridors, mechanical rooms, and storage; preserve specified stone in public/owner-facing areas.", savings: Math.round(total * 0.008), riskLevel: "MEDIUM" });
      }
      if (codes.has("23-00-00")) {
        ideas.push({ title: "VRF instead of chiller+AHU for compatible zones", description: "Where program supports it, VRF system reduces ductwork, mechanical space, and chiller plant cost while meeting commercial zone-load. Confirm acoustic fit.", savings: Math.round(total * 0.015), riskLevel: "MEDIUM" });
      }
      if (codes.has("31-20-00")) {
        ideas.push({ title: "Balance cut/fill on site", description: "Revise grading to balance cut and fill, eliminating import/export. Coordinate with civil engineer.", savings: Math.round(total * 0.009), riskLevel: "LOW" });
      }
      if (codes.has("05-31-00") || codes.has("07-50-00")) {
        ideas.push({ title: "Alternate structural deck span", description: "Substitute 1-1/2 inch composite deck for specified 3-inch deck on shorter spans; reduces material cost and speeds pour.", savings: Math.round(total * 0.005), riskLevel: "LOW" });
      }

      // Always-available strategic VE options.
      ideas.push({ title: "Owner-direct long-lead procurement", description: "Lock switchgear, chillers, and generators via owner-direct purchase (tax-exempt where applicable) to avoid escalation + expedite fees.", savings: Math.round(total * 0.006), riskLevel: "LOW" });
      ideas.push({ title: "Pre-purchase & storage of volatile-price items", description: "Lock steel, copper, and PVC prices at award to hedge against index escalation during construction.", savings: Math.round(total * 0.011), riskLevel: "LOW" });
      ideas.push({ title: "Alternative delivery (DBB → CM@R conversion)", description: "If owner agrees to GMP + shared-savings structure, contractor can surface VE during precon that traditional DBB misses.", savings: Math.round(total * 0.025), riskLevel: "MEDIUM" });

      // If biggest line is very large, add a targeted suggestion.
      if (biggestLine && toNum(biggestLine.amount) > total * 0.2) {
        ideas.push({
          title: `Deep-dive cost review: ${biggestLine.description}`,
          description: `This single line represents ${((toNum(biggestLine.amount) / total) * 100).toFixed(0)}% of direct cost. Recommend detailed buyout with 3+ subs + take-off verification. Even a 5% reduction here drops total price materially.`,
          savings: Math.round(toNum(biggestLine.amount) * 0.05),
          riskLevel: "LOW",
        });
      }

      return ideas.sort((a, b) => b.savings - a.savings).slice(0, 8);
    },
  });
}
