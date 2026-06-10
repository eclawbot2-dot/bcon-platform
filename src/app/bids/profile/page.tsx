import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { ChipInput } from "@/components/ui/chip-input";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { AgencyTier } from "@prisma/client";
import { toNum } from "@/lib/money";

const ALL_TIERS: AgencyTier[] = [
  "CIVILIAN", "DOD", "VA", "USACE", "GSA", "HOMELAND", "ENERGY", "TRANSPORTATION", "HEALTH", "EDUCATION", "INDEPENDENT", "OTHER",
];

function parseListJson(json: string | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default async function BidProfilePage() {
  const tenant = await requireTenant();
  const profile = await prisma.tenantBidProfile.findUnique({ where: { tenantId: tenant.id } });

  const targetNaics = parseListJson(profile?.targetNaicsJson);
  const qualifiedSetAsides = parseListJson(profile?.qualifiedSetAsidesJson);
  const targetStates = parseListJson(profile?.targetStatesJson);
  const targetCities = parseListJson(profile?.targetCitiesJson);
  const boostKeywords = parseListJson(profile?.boostKeywordsJson);
  const blockKeywords = parseListJson(profile?.blockKeywordsJson);
  const preferredTiers = parseListJson(profile?.preferredTiersJson);

  const sourceCount = await prisma.rfpSource.count({ where: { tenantId: tenant.id } });
  const autoDraftSourceCount = await prisma.rfpSource.count({ where: { tenantId: tenant.id, autoDraftEnabled: true } });
  const recentScored = await prisma.rfpListing.count({
    where: { tenantId: tenant.id, score: { not: null } },
  });
  const recentHot = await prisma.rfpListing.count({
    where: { tenantId: tenant.id, score: { gte: profile?.hotThreshold ?? 70 } },
  });

  return (
    <AppLayout
      eyebrow="BD · Bid profile"
      title="What's a good bid for us?"
      description="Tell the autopilot what kinds of solicitations are worth your time. The scoring engine ranks every listing 0-100 against this profile, and listings above the hot threshold can auto-draft."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Watching" value={sourceCount} sub="sources" />
          <StatTile label="Auto-draft on" value={autoDraftSourceCount} sub="of sources" tone={autoDraftSourceCount > 0 ? "good" : undefined} />
          <StatTile label="Listings scored" value={recentScored} />
          <StatTile label="Hot listings" value={recentHot} sub={`≥ ${profile?.hotThreshold ?? 70}`} tone={recentHot > 0 ? "good" : undefined} />
        </section>

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Matching profile</div>
          <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>
            Comma- or newline-separated lists. Empty fields mean &quot;no preference&quot; and get a neutral 0.5 fit score.
          </p>
          <form action="/api/bid-profile/save" method="post" className="mt-4 grid gap-4">
            <div>
              <label htmlFor="bp-naics" className="form-label">Target NAICS codes (prefix-matched)</label>
              <ChipInput name="targetNaics" defaultValue={targetNaics.join("\n")} placeholder="Add NAICS code or describe the work (e.g. 236220 or paving)…" suggestKind="naics" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="bp-sa" className="form-label">Set-asides we qualify for</label>
                <ChipInput name="qualifiedSetAsides" defaultValue={qualifiedSetAsides.join("\n")} placeholder="Add set-aside (e.g. SDVOSB)…" />
                <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Listings restricted to set-asides we don&apos;t hold drop to 0 score on this signal. Unrestricted listings still score 0.7.</p>
              </div>
              <div>
                <label htmlFor="bp-tiers" className="form-label">Preferred agency tiers</label>
                <select id="bp-tiers" name="preferredTiers" multiple defaultValue={preferredTiers} className="form-select" size={6}>
                  {ALL_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Hold ⌘/Ctrl to multi-select. Empty = no preference (neutral 0.5).</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="bp-states" className="form-label">Target states</label>
                <ChipInput name="targetStates" defaultValue={targetStates.join("\n")} placeholder="Add state (e.g. NC)…" />
              </div>
              <div>
                <label htmlFor="bp-cities" className="form-label">Target cities (optional)</label>
                <ChipInput name="targetCities" defaultValue={targetCities.join("\n")} placeholder="Add city (e.g. Charleston)…" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="bp-min" className="form-label">Min listing value ($)</label>
                <input id="bp-min" name="minValue" type="number" step="1000" defaultValue={profile?.minValue == null ? "" : toNum(profile.minValue)} placeholder="500000" className="form-input" />
              </div>
              <div>
                <label htmlFor="bp-max" className="form-label">Max listing value ($)</label>
                <input id="bp-max" name="maxValue" type="number" step="1000" defaultValue={profile?.maxValue == null ? "" : toNum(profile.maxValue)} placeholder="50000000" className="form-input" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="bp-boost" className="form-label">Boost keywords</label>
                <ChipInput name="boostKeywords" defaultValue={boostKeywords.join("\n")} placeholder="Add keyword (e.g. design-build)…" />
                <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Listings whose title or summary contains any of these gain points.</p>
              </div>
              <div>
                <label htmlFor="bp-block" className="form-label">Block keywords</label>
                <ChipInput name="blockKeywords" defaultValue={blockKeywords.join("\n")} placeholder="Add keyword (e.g. demolition only)…" />
                <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Any match drives the keyword fit to 0 — useful for scopes you don&apos;t pursue.</p>
              </div>
            </div>

            <div>
              <label htmlFor="bp-hot" className="form-label">Hot threshold ({profile?.hotThreshold ?? 70})</label>
              <input id="bp-hot" name="hotThreshold" type="range" min={50} max={95} step={5} defaultValue={profile?.hotThreshold ?? 70} className="w-full" />
              <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
                Listings scoring at-or-above this become &quot;hot.&quot; Sources with auto-draft enabled fire the bid pipeline automatically when their listings cross this score.
              </p>
            </div>

            <div>
              <label htmlFor="bp-notes" className="form-label">Notes (internal)</label>
              <textarea id="bp-notes" name="notes" rows={2} defaultValue={profile?.notes ?? ""} className="form-textarea" />
            </div>

            <div>
              <button type="submit" className="btn-primary">Save profile</button>
            </div>
          </form>
        </section>

        <div className="text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/bids/sources" className="underline">Sources →</Link>
          {" · "}
          <Link href="/bids/listings" className="underline">Listings →</Link>
          {" · "}
          <Link href="/bids/discover" className="underline">Discover portals →</Link>
        </div>
      </div>
    </AppLayout>
  );
}
