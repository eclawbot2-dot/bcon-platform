/**
 * Run the generic-html scraper against every catalog row that
 * declares scraperKind=HTML, scraperModule=generic-html. Reports which
 * portals actually return bid-shaped listings and which fail (404,
 * SPA, captcha, no-tables, no-bid-rows).
 *
 * Also persists the result as `scraperLastVerifiedAt` on the catalog
 * row + a short status note, so the /bids/portal-coverage admin page
 * can show ops staff which portals are working vs which need a
 * portal-specific scraper.
 *
 * Run: `npx tsx scripts/verify-html-scrapers.ts`
 *
 * Polite by default — 6 portals at a time, ~12s timeout each.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dispatchCrawl } from "../src/lib/scrapers";

type Row = {
  name: string;
  url: string;
  ok: boolean;
  count: number;
  note: string;
  firstTitle?: string;
};

async function probeOne(catalog: Awaited<ReturnType<typeof PrismaClient.prototype.solicitationPortalCatalog.findFirst>>): Promise<Row> {
  if (!catalog) return { name: "(?)", url: "(?)", ok: false, count: 0, note: "null catalog" };
  const fakeSource = {
    id: "verify",
    tenantId: "verify",
    label: catalog.name,
    url: catalog.url,
    agencyHint: catalog.agencyName,
    catalogId: catalog.id,
    cadence: "DAILY",
    naicsFilter: catalog.naicsFocus?.split(",")[0]?.trim() ?? null,
    keywordsJson: "[]",
    setAsideFilter: null,
    status: "ACTIVE" as const,
    geoScope: catalog.geoScope,
    geoCity: catalog.geoCity,
    geoState: catalog.geoState,
    geoCountry: "US",
    authType: catalog.authType,
    authUsername: null,
    authPasswordEnc: null,
    authApiKeyEnc: null,
    authCookieJar: null,
    authNotes: null,
    autoLogin: false,
    autoDraftEnabled: false,
    autoDraftMinScore: 70,
    notes: null,
    lastCheckedAt: null,
    lastCheckNote: null,
    lastResultCount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  try {
    const result = await dispatchCrawl({ source: fakeSource as never, catalog, keywords: [] });
    return {
      name: catalog.name,
      url: catalog.url,
      ok: result.ok,
      count: result.listings.length,
      note: result.note.slice(0, 140),
      firstTitle: result.listings[0]?.title.slice(0, 80),
    };
  } catch (err) {
    return { name: catalog.name, url: catalog.url, ok: false, count: 0, note: (err instanceof Error ? err.message : String(err)).slice(0, 140) };
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required (postgresql://).");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    // Probe every catalog row that claims to be auto-scraped. Manual
    // and deprecated rows are skipped — they're not supposed to work.
    const rows = await prisma.solicitationPortalCatalog.findMany({
      where: { scraperKind: { in: ["API", "RSS", "HTML"] } },
      orderBy: [{ scraperKind: "asc" }, { agencyKind: "asc" }, { name: "asc" }],
    });
    console.log(`Verifying ${rows.length} auto-scraper-backed catalog rows...\n`);

    const out: Row[] = [];
    const batchSize = 6;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      const results = await Promise.all(slice.map((r) => probeOne(r)));
      out.push(...results);
      // Persist verification telemetry on each catalog row so the
      // /bids/portal-coverage admin page can show fresh status
      // without re-probing every visit.
      for (let j = 0; j < slice.length; j++) {
        const row = slice[j]!;
        const r = results[j]!;
        await prisma.solicitationPortalCatalog.update({
          where: { id: row.id },
          data: {
            lastVerifiedAt: new Date(),
            lastVerifiedOk: r.ok && r.count > 0,
            lastVerifiedCount: r.count,
            lastVerifiedNote: r.note,
          },
        });
      }
    }

    const passing = out.filter((r) => r.ok && r.count > 0);
    const empty = out.filter((r) => r.ok && r.count === 0);
    const failing = out.filter((r) => !r.ok);

    console.log("\n=== PASSING (real listings) ===");
    for (const r of passing) {
      console.log(`  [${r.count}] ${r.name}`);
      if (r.firstTitle) console.log(`        sample: ${r.firstTitle}`);
    }
    console.log(`\n=== OK BUT EMPTY (${empty.length}) — site likely SPA or no current lettings ===`);
    for (const r of empty) console.log(`  ${r.name} — ${r.note}`);
    console.log(`\n=== FAILING (${failing.length}) ===`);
    for (const r of failing) console.log(`  ${r.name} — ${r.note}`);

    console.log(`\nSummary: ${passing.length} passing / ${empty.length} empty / ${failing.length} failing of ${out.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
