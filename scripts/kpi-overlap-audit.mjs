/**
 * Adversarial KPI/stat-card overlap audit.
 *
 * Logs into the running app (localhost:3101), visits the money-heavy
 * pages, REPLACES every stat-tile primary value with adversarially long
 * strings ($38,500,000 / $16,500,000 / 999,999.99% / $1,234,567,890.55)
 * via DOM textContent injection (no data is persisted), then at
 * 1440/1280/1024/768/390 asserts:
 *   1. no two tile rects intersect (unless one contains the other —
 *      nested panel-inside-card sections are legitimate),
 *   2. every injected value rect stays inside its own tile rect,
 *   3. no document-level horizontal overflow.
 * Screenshots each page/width to scripts/.kpi-audit/<label>/.
 *
 * Usage: node scripts/kpi-overlap-audit.mjs [before|after]
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const LABEL = process.argv[2] || "audit";
const BASE = process.env.AUDIT_BASE || "http://localhost:3101";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join("scripts", ".kpi-audit", LABEL);
const WIDTHS = [1440, 1280, 1024, 768, 390];
const LONG = ["$38,500,000", "$16,500,000", "999,999.99%", "$1,234,567,890.55"];

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// --- login ---
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
await page.type('input[name="email"]', "pm@construction.local");
await page.type('input[name="password"]', "demo1234");
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
  page.click('button[type="submit"]'),
]);
if (page.url().includes("/login")) throw new Error("login failed: " + page.url());
console.log("logged in ->", page.url());

// --- discover a project id + a pay-app id ---
await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
const projectId = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/projects/"]')].find((x) => /^\/projects\/(?!create$|new$)[^/]+$/.test(x.getAttribute("href")));
  return a ? a.getAttribute("href").split("/")[2] : null;
});
let payAppPath = null;
if (projectId) {
  await page.goto(`${BASE}/projects/${projectId}/pay-apps`, { waitUntil: "networkidle2" });
  payAppPath = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="/pay-apps/"]')].find((x) => /\/pay-apps\/[^/]+$/.test(x.getAttribute("href")) && !x.getAttribute("href").endsWith("reconciliation"));
    return a ? a.getAttribute("href") : null;
  });
}

const PAGES = [
  "/",
  "/finance",
  "/finance/ap-aging",
  "/reports",
  "/reports/change-exposure",
  "/reports/ball-in-court",
  "/commercial",
  ...(projectId
    ? [
        `/projects/${projectId}/financials`,
        `/projects/${projectId}/pay-apps`,
        `/projects/${projectId}/change-orders`,
        `/projects/${projectId}/profit-audit`,
      ]
    : []),
  ...(payAppPath ? [payAppPath] : []),
];

function slug(p) {
  return p === "/" ? "dashboard" : p.replace(/^\//, "").replace(/[^a-z0-9-]+/gi, "_");
}

const results = [];
for (const route of PAGES) {
  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 60000 });

    // inject long values into every stat-tile primary value node
    const audit = await page.evaluate((LONG) => {
      const isValueNode = (el) => {
        const c = typeof el.className === "string" ? el.className : "";
        return (
          (/(^|\s)text-2xl(\s|$)/.test(c) || /(^|\s)text-3xl(\s|$)/.test(c)) &&
          /font-(semibold|bold)/.test(c) &&
          el.closest(".panel,.card")
        );
      };
      const values = [...document.querySelectorAll("div,h2,a,span")].filter(isValueNode);
      values.forEach((el, i) => {
        el.textContent = LONG[i % LONG.length];
      });
      // force layout
      void document.body.offsetHeight;

      const tiles = [...new Set(values.map((el) => el.closest(".panel,.card")))];
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
      };
      // The INK rect of the text content — element rects do not grow when
      // text visibly overflows (overflow: visible), which is exactly how
      // the bug escaped earlier audits. A Range rect captures the real
      // painted extent of the glyphs.
      const inkRect = (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
      };
      const contains = (a, b, t) => b.x >= a.x - t && b.y >= a.y - t && b.x + b.w <= a.x + a.w + t && b.y + b.h <= a.y + a.h + t;
      const intersects = (a, b, t) => {
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return ix > t && iy > t;
      };
      const TOL = 1;
      const overlaps = [];
      for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
          const a = rect(tiles[i]);
          const b = rect(tiles[j]);
          if (a.w === 0 || b.w === 0) continue;
          if (tiles[i].contains(tiles[j]) || tiles[j].contains(tiles[i])) continue;
          if (intersects(a, b, TOL) && !contains(a, b, TOL) && !contains(b, a, TOL)) {
            overlaps.push({
              a: tiles[i].textContent.slice(0, 60),
              b: tiles[j].textContent.slice(0, 60),
              ra: a,
              rb: b,
            });
          }
        }
      }
      const escapes = [];
      for (const v of values) {
        const tile = v.closest(".panel,.card");
        const rv = inkRect(v);
        const rt = rect(tile);
        if (rv.w === 0) continue;
        if (!contains(rt, rv, TOL)) {
          escapes.push({ value: v.textContent, rv, rt, label: tile.textContent.slice(0, 60) });
          continue;
        }
        // value ink must not bleed into any OTHER tile
        for (const other of tiles) {
          if (other === tile || other.contains(tile) || tile.contains(other)) continue;
          const ro = rect(other);
          if (ro.w === 0) continue;
          if (intersects(rv, ro, TOL)) {
            escapes.push({ value: v.textContent, rv, rt: ro, label: "BLEEDS INTO: " + other.textContent.slice(0, 60) });
            break;
          }
        }
      }
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return { tileCount: tiles.length, valueCount: values.length, overlaps, escapes, docOverflow };
    }, LONG);

    const shot = path.join(OUT, `${slug(route)}-${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    const ok = audit.overlaps.length === 0 && audit.escapes.length === 0 && audit.docOverflow <= 1;
    results.push({ route, width, ...audit, ok });
    console.log(
      `${ok ? "PASS" : "FAIL"} ${route} @${width} tiles=${audit.tileCount} values=${audit.valueCount} overlaps=${audit.overlaps.length} escapes=${audit.escapes.length} docOverflow=${audit.docOverflow}`
    );
    for (const o of audit.overlaps.slice(0, 3)) console.log("   overlap:", JSON.stringify(o.ra), "vs", JSON.stringify(o.rb), "|", o.a.slice(0, 40));
    for (const e of audit.escapes.slice(0, 3)) console.log("   escape:", e.value, "tile=", JSON.stringify(e.rt), "value=", JSON.stringify(e.rv));
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failures = results.filter((r) => !r.ok);
console.log(`\n=== ${LABEL}: ${results.length - failures.length}/${results.length} page-width combos clean, ${failures.length} failing ===`);
process.exit(failures.length ? 2 : 0);
