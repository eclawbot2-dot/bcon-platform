/**
 * Scraper integration test — run each registered scraper against the
 * catalog row(s) it backs and report:
 *
 *   - listings returned
 *   - first listing's title (proof real data came back)
 *   - error messages if it failed
 *
 * Run: `npx tsx scripts/test-scrapers.ts`
 *
 * This is the source of truth for "do the scrapers work with real
 * data". Run it after every catalog or scraper change. It does NOT
 * write to the DB — it only reads catalog rows and exercises the
 * scraper modules.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { dispatchCrawl, registeredScraperModules } from "../src/lib/scrapers";

type Result = {
  name: string;
  module: string;
  ok: boolean;
  count: number;
  firstTitle?: string;
  note: string;
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required (postgresql://).");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const modules = registeredScraperModules();
    console.log(`Registered scraper modules: ${modules.join(", ")}\n`);

    // Pick one representative catalog row per module so we hit the
    // real upstream service exactly once per scraper, not 50× for
    // sam-gov. We pick by name lookup — enough to prove plumbing.
    // SAM.gov only runs if the API key is set so we don't spam the
    // failure log when the operator hasn't configured one.
    const samples: Array<{ name: string; module: string }> = [];
    if (process.env.SAM_GOV_API_KEY) {
      samples.push({ name: "SAM.gov — Contract Opportunities", module: "sam-gov" });
    } else {
      console.log("(Skipping sam-gov: SAM_GOV_API_KEY not configured)\n");
    }

    // For generic-html, prefer KYTC since it's been verified to
    // return real data with the current heuristics. Otherwise fall
    // back to any HTML row.
    const kytc = await prisma.solicitationPortalCatalog.findFirst({ where: { name: "KYTC Bid Letting" } });
    if (kytc && kytc.scraperKind === "HTML") {
      samples.push({ name: kytc.name, module: "generic-html" });
    } else {
      const htmlRow = await prisma.solicitationPortalCatalog.findFirst({ where: { scraperKind: "HTML", scraperModule: "generic-html" } });
      if (htmlRow) samples.push({ name: htmlRow.name, module: "generic-html" });
    }
    const rssRow = await prisma.solicitationPortalCatalog.findFirst({ where: { scraperKind: "RSS", scraperModule: "generic-rss" } });
    if (rssRow) samples.push({ name: rssRow.name, module: "generic-rss" });

    const results: Result[] = [];
    for (const { name, module } of samples) {
      const catalog = await prisma.solicitationPortalCatalog.findFirst({ where: { name } });
      if (!catalog) {
        results.push({ name, module, ok: false, count: 0, note: "catalog row not found" });
        continue;
      }
      // Synthesize a transient RfpSource shape — we don't actually
      // create a row.
      const fakeSource = {
        id: "test",
        tenantId: "test",
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
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSweepAt: null,
        lastSweepStatus: null,
        lastSweepNote: null,
      };
      const result = await dispatchCrawl({
        source: fakeSource as never,
        catalog,
        keywords: ["construction"],
      });
      const r: Result = {
        name: catalog.name,
        module,
        ok: result.ok,
        count: result.listings.length,
        note: result.note,
      };
      if (result.listings.length > 0) {
        r.firstTitle = result.listings[0]!.title;
      }
      results.push(r);
    }

    let pass = 0;
    let fail = 0;
    for (const r of results) {
      const tag = r.ok ? `PASS [${r.count}]` : "FAIL";
      console.log(`${tag.padEnd(10)} ${r.module.padEnd(15)} ${r.name}`);
      if (r.firstTitle) console.log(`           sample: ${r.firstTitle.slice(0, 100)}`);
      console.log(`           note:   ${r.note.slice(0, 200)}`);
      console.log("");
      if (r.ok) pass++;
      else fail++;
    }
    console.log(`\nResult: ${pass} passing, ${fail} failing of ${results.length} total`);
    if (fail > 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
