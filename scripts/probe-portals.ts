/**
 * One-shot probe of every portal in the catalog. For each row, fetches
 * the URL with a short timeout and reports status, content-type, body
 * length, and a guess at the scrape strategy. Used to triage which
 * portals can have real scrapers written today vs which need
 * browser/auth/login that doesn't fit a server-side fetch.
 *
 * Run: `npx tsx scripts/probe-portals.ts`
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Probe = {
  name: string;
  url: string;
  status: number | "timeout" | "err";
  contentType: string | null;
  bodySize: number;
  guess: string;
  detail?: string;
};

async function probe(name: string, url: string): Promise<Probe> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; bcon-rfp-probe/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml,application/json,*/*",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const lower = text.toLowerCase();
    let guess = "html";
    if (ct.includes("json")) guess = "json";
    else if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom") || lower.includes("<rss") || lower.includes("<feed") || lower.includes("<atom")) guess = "rss";
    else if (lower.includes("captcha") || lower.includes("cloudflare") && lower.includes("checking")) guess = "captcha";
    else if (lower.includes("sign in") && lower.length < 30_000 || lower.includes("login required")) guess = "login";
    return { name, url, status: res.status, contentType: ct, bodySize: text.length, guess };
  } catch (err) {
    clearTimeout(t);
    if (err instanceof Error && err.name === "AbortError") return { name, url, status: "timeout", contentType: null, bodySize: 0, guess: "timeout" };
    return { name, url, status: "err", contentType: null, bodySize: 0, guess: "error", detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required (postgresql://).");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    const portals = await prisma.solicitationPortalCatalog.findMany({ orderBy: [{ agencyKind: "asc" }, { name: "asc" }] });
    console.log(`Probing ${portals.length} portals...`);
    // Run in batches of 6 to keep it polite.
    const batch = 6;
    const out: Array<Probe & { id: string }> = [];
    for (let i = 0; i < portals.length; i += batch) {
      const slice = portals.slice(i, i + batch);
      const results = await Promise.all(slice.map((p) => probe(p.name, p.url)));
      const now = new Date();
      // Persist URL-reachability telemetry on EVERY catalog row,
      // including MANUAL ones — gives /admin/portal-coverage a
      // complete picture of which URLs are still alive. The
      // verify-html-scrapers script will overwrite lastVerifiedNote
      // for auto-scraper rows with scraper-specific output, but
      // until then the URL probe result is the best telemetry we
      // have.
      for (let j = 0; j < slice.length; j++) {
        const portal = slice[j]!;
        const r = results[j]!;
        const ok = typeof r.status === "number" && r.status >= 200 && r.status < 400 && r.bodySize > 200;
        const note = typeof r.status === "number"
          ? `URL ${r.status} ${r.guess} ${r.bodySize}b`
          : `URL ${String(r.status)}: ${r.detail?.slice(0, 100) ?? "no body"}`;
        await prisma.solicitationPortalCatalog.update({
          where: { id: portal.id },
          data: {
            lastVerifiedAt: now,
            lastVerifiedOk: ok,
            lastVerifiedCount: 0,
            lastVerifiedNote: note,
          },
        });
        out.push({ ...r, id: portal.id });
      }
    }
    for (const p of out) {
      const status = typeof p.status === "number" ? String(p.status) : p.status.toUpperCase();
      console.log(`${status.padEnd(8)}  ${p.guess.padEnd(8)}  ${String(p.bodySize).padStart(7)}  ${(p.contentType ?? "-").slice(0, 40).padEnd(40)}  ${p.name}`);
      if (p.detail) console.log(`           ${p.detail.slice(0, 100)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
