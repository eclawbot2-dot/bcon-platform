// One-off audit: API routes never referenced by any page, component,
// lib, script, or config — candidates for dead code or missing UI.
import fs from "fs";
import path from "path";

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const routes = walk("src/app/api")
  .filter((p) => p.endsWith("route.ts"))
  .map((p) => p.split(path.sep).join("/").replace(/^src\/app/, "").replace(/\/route\.ts$/, ""));

const srcFiles = walk("src").filter(
  (p) => !p.split(path.sep).join("/").includes("src/app/api/") && /\.(tsx?|mjs)$/.test(p)
);
const extraRoots = ["scripts", "src/middleware.ts", "next.config.ts", "docs", "README.md"];
const extra = extraRoots
  .flatMap((p) => (fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? walk(p) : [p]) : []))
  .filter((p) => /\.(tsx?|mjs|json|md|yml)$/.test(p));

const all = [...srcFiles, ...extra]
  .map((f) => {
    try {
      return fs.readFileSync(f, "utf8");
    } catch {
      return "";
    }
  })
  .join("\n");

const orphans = [];
for (const r of routes) {
  const segs = r.split("/").filter(Boolean);
  const pat =
    "/" +
    segs
      .map((s) => (s.startsWith("[") ? "[^/\"'`?]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&")))
      .join("/");
  if (!new RegExp(pat).test(all)) orphans.push(r);
}
console.log(orphans.join("\n") || "(none)");
