// One-off audit: every internal href in src/ must resolve to a page route.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk("src");
const hrefRe = /href=\{?["'`]([^"'`]+)["'`]/g;
const hits = new Map();
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  let m;
  while ((m = hrefRe.exec(txt))) {
    const h = m[1];
    if (h.startsWith("/") && !h.startsWith("/api/")) {
      if (!hits.has(h)) hits.set(h, f);
    }
  }
}

const pages = walk("src/app")
  .filter((p) => p.endsWith("page.tsx"))
  .map((p) => p.replace(/\\/g, "/").replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/");

function resolves(href) {
  let clean = href.split("?")[0].split("#")[0];
  if (clean === "" || clean === "/") return true;
  const t = clean.replace(/\$\{[^}]+\}/g, "__DYN__");
  const segs = t.split("/").filter(Boolean);
  outer: for (const pg of pages) {
    const ps = pg.split("/").filter(Boolean);
    if (ps.length !== segs.length) continue;
    for (let i = 0; i < segs.length; i++) {
      if (ps[i].startsWith("[") || segs[i] === "__DYN__") continue;
      if (ps[i] !== segs[i]) continue outer;
    }
    return true;
  }
  return false;
}

for (const [h, f] of hits) {
  if (!resolves(h)) console.log(`${h}    <-- ${f}`);
}
