/**
 * RFP autopilot: drive a listing through the full bid pipeline in one call.
 *
 * Steps:
 *   1. Ensure an Opportunity exists (upsert-by-solicitation-number).
 *   2. Generate a bid draft (sections) via draftBidFromListing.
 *   3. Generate a line-item estimate via generateEstimateForDraft.
 *   4. Run compliance check and mark draft UNDER_REVIEW if pass.
 *
 * Also exports the tenant-wide `crawlAllSources` used by the scheduled sweep.
 */

import { prisma } from "@/lib/prisma";
import { draftBidFromListing, runComplianceCheck } from "@/lib/bid-author";
import { generateEstimateForDraft } from "@/lib/estimating";
import { crawlSourceAndPersist, modeFromListing } from "@/lib/rfp-crawl";
import { defaultProfile, scoreListing } from "@/lib/listing-score";
import { OpportunityStage, RfpSourceStatus } from "@prisma/client";
import { toNum } from "@/lib/money";

export async function autopilotListing(tenantId: string, listingId: string, companyName: string): Promise<{ ok: boolean; draftId?: string; passed?: number; total?: number; note: string }> {
  const listing = await prisma.rfpListing.findFirst({ where: { id: listingId, tenantId } });
  if (!listing) return { ok: false, note: "listing not found" };

  // Step 1 — upsert opportunity
  let oppId = listing.opportunityId;
  if (!oppId) {
    const existing = await prisma.opportunity.findFirst({
      where: { tenantId, name: { contains: listing.solicitationNo ?? listing.title.slice(0, 40) } },
    });
    const opp = existing ?? await prisma.opportunity.create({
      data: {
        tenantId,
        name: `${listing.agency} · ${listing.title}`,
        clientName: listing.agency,
        stage: OpportunityStage.PROPOSAL,
        estimatedValue: listing.estimatedValue ?? 0,
        probability: 45,
        dueDate: listing.dueAt,
        source: "autopilot",
        mode: modeFromListing({ placeOfPerformance: listing.placeOfPerformance, title: listing.title }),
      },
    });
    oppId = opp.id;
    await prisma.rfpListing.update({ where: { id: listing.id }, data: { opportunityId: oppId, status: "PURSUING" } });
  }

  // Step 2 — draft
  const draft = await draftBidFromListing({ tenantId, listingId: listing.id, companyName, opportunityId: oppId ?? undefined, authorName: "AI Autopilot" });

  // Step 3 — line-item estimate
  const estimate = await generateEstimateForDraft(draft.id);

  // Step 4 — compliance
  const compliance = await runComplianceCheck(draft.id);

  // If all pass, mark draft UNDER_REVIEW so humans see it's ready to submit.
  if (compliance.overall === "PASS") {
    await prisma.bidDraft.update({ where: { id: draft.id }, data: { status: "UNDER_REVIEW" } });
  }

  return {
    ok: true,
    draftId: draft.id,
    passed: compliance.passed,
    total: compliance.total,
    note: `Drafted ${estimate.lineItems} line items ($${estimate.total.toLocaleString()}). Compliance ${compliance.passed}/${compliance.total} — ${compliance.overall}.`,
  };
}

/**
 * Run a sweep across every ACTIVE source in every tenant, respecting
 * cadence. After each source crawl, score the new listings against the
 * tenant's bid profile and (if the source has autoDraftEnabled) fire
 * autopilotListing on listings whose score crosses the configured
 * threshold.
 */
export async function sweepAllSources(tenantId?: string): Promise<{
  ok: boolean;
  sourcesChecked: number;
  newListings: number;
  scored: number;
  autoDrafted: number;
}> {
  // When `tenantId` is supplied (tenant-facing "sweep now" trigger) the
  // sweep is restricted to that tenant's sources. The platform cron calls
  // this with no argument to sweep every active source across all tenants.
  const sources = await prisma.rfpSource.findMany({
    where: { status: RfpSourceStatus.ACTIVE, ...(tenantId ? { tenantId } : {}) },
    include: { tenant: { include: { bidProfile: true } } },
  });
  let checked = 0;
  let created = 0;
  let scored = 0;
  let autoDrafted = 0;
  const now = Date.now();

  for (const source of sources) {
    const cadenceMs = cadenceToMs(source.cadence);
    if (source.lastCheckedAt && now - new Date(source.lastCheckedAt).getTime() < cadenceMs) continue;
    const result = await crawlSourceAndPersist(source.id);
    checked += 1;
    created += result.created;

    if (result.created === 0) continue;

    // Score the listings created in this crawl. Pull the latest N
    // unscored listings for this source — slightly imprecise but
    // avoids passing IDs around.
    const profile = source.tenant.bidProfile
      ? bidProfileFromRow(source.tenant.bidProfile)
      : defaultProfile();
    const unscored = await prisma.rfpListing.findMany({
      where: {
        sourceId: source.id,
        score: null,
        // Skip listings that already received an auto-draft attempt —
        // a previous concurrent sweep may have processed them. This
        // prevents double-firing autopilotListing on the same row.
        autoDraftedAt: null,
      },
      orderBy: { discoveredAt: "desc" },
      take: result.created,
    });
    for (const listing of unscored) {
      const breakdown = scoreListing(listing, profile);
      // Atomic guard: only score listings still null. If a parallel
      // sweep wrote a score between our findMany and update, updateMany
      // matches zero rows and we skip — no duplicate autopilot fire.
      const updated = await prisma.rfpListing.updateMany({
        where: { id: listing.id, score: null, autoDraftedAt: null },
        data: {
          score: breakdown.score,
          scoreExplanation: JSON.stringify(breakdown.signals),
        },
      });
      if (updated.count === 0) continue;
      scored += 1;

      if (source.autoDraftEnabled && breakdown.score >= source.autoDraftMinScore) {
        try {
          const auto = await autopilotListing(source.tenantId, listing.id, source.tenant.name);
          await prisma.rfpListing.update({
            where: { id: listing.id },
            data: {
              autoDrafted: auto.ok,
              autoDraftedAt: new Date(),
              autoDraftError: auto.ok ? null : auto.note.slice(0, 500),
            },
          });
          if (auto.ok) autoDrafted += 1;
        } catch (err) {
          console.error("[sweep] autopilotListing threw", { listingId: listing.id, err });
          await prisma.rfpListing.update({
            where: { id: listing.id },
            data: {
              autoDraftError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
              autoDraftedAt: new Date(),
            },
          });
        }
      }
    }
  }

  return { ok: true, sourcesChecked: checked, newListings: created, scored, autoDrafted };
}

type StoredBidProfile = {
  targetNaicsJson: string;
  qualifiedSetAsidesJson: string;
  targetStatesJson: string;
  targetCitiesJson: string;
  minValue: number | { toNumber: () => number } | null;
  maxValue: number | { toNumber: () => number } | null;
  boostKeywordsJson: string;
  blockKeywordsJson: string;
  preferredTiersJson: string;
  hotThreshold: number;
};

/** Map a TenantBidProfile row into the in-memory BidProfile shape. */
function bidProfileFromRow(row: StoredBidProfile) {
  const parseList = (json: string): string[] => {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    targetNaics: parseList(row.targetNaicsJson),
    qualifiedSetAsides: parseList(row.qualifiedSetAsidesJson),
    targetStates: parseList(row.targetStatesJson),
    targetCities: parseList(row.targetCitiesJson),
    minValue: row.minValue == null ? null : toNum(row.minValue),
    maxValue: row.maxValue == null ? null : toNum(row.maxValue),
    boostKeywords: parseList(row.boostKeywordsJson),
    blockKeywords: parseList(row.blockKeywordsJson),
    preferredTiers: parseList(row.preferredTiersJson),
    hotThreshold: row.hotThreshold,
  };
}

function cadenceToMs(cadence: string): number {
  switch (cadence.toUpperCase()) {
    case "HOURLY": return 60 * 60 * 1000;
    case "DAILY": return 4 * 60 * 60 * 1000; // run at least every 4h → 6x/business-day
    case "WEEKLY": return 24 * 60 * 60 * 1000;
    default: return 4 * 60 * 60 * 1000;
  }
}
