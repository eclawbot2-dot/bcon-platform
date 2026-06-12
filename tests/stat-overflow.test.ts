import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * KPI/stat-card overflow hardening (owner mandate, propagated
 * cross-platform): long values like "$38,500,000" must never bleed into a
 * neighboring card. Currency strings are single unbreakable tokens, so a
 * stat value WITHOUT overflow handling paints past its tile at narrow
 * widths — element rects don't grow with overflowing ink, which is why
 * code review and rect-based audits missed it.
 *
 * These tests statically enforce the hardened pattern so it can't
 * regress:
 *  - shared StatCard/StatTile: min-w-0 + overflow-hidden roots,
 *    truncate + tabular-nums values,
 *  - every local Stat()/Tile() page helper follows the same pattern,
 *  - no big currency value anywhere renders without truncate.
 */

const SRC = path.join(__dirname, "..", "src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".tsx") ? [p] : [];
  });
}

const tsxFiles = walk(SRC);
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("shared stat components are overflow-hardened", () => {
  it("StatCard truncates its value and cannot inflate its grid track", () => {
    const src = read(path.join(SRC, "components", "ui", "stat-card.tsx"));
    expect(src).toMatch(/card flex min-w-0 items-start gap-4 overflow-hidden/);
    expect(src).toMatch(/min-w-0 truncate text-2xl font-bold tabular-nums/);
    expect(src).toMatch(/title=\{String\(value\)\}/);
  });

  it("StatTile truncates its value and cannot inflate its grid track", () => {
    const src = read(path.join(SRC, "components", "ui", "stat-tile.tsx"));
    expect(src).toMatch(/panel min-w-0 overflow-hidden p-4/);
    expect(src).toMatch(/min-w-0 truncate text-2xl font-semibold tabular-nums/);
    expect(src).toMatch(/title=\{String\(value\)\}/);
  });
});

describe("local page-level Stat()/Tile() helpers follow the hardened pattern", () => {
  // Every page-local stat helper renders `{value}` at text-2xl. Each one
  // must truncate the value; its tile root must carry min-w-0 +
  // overflow-hidden so the tile can shrink instead of inflating tracks.
  const helperFiles = tsxFiles.filter((f) => {
    const src = read(f);
    return /function (Stat|Tile)\(\{ (label|href)/.test(src) && /text-2xl font-semibold/.test(src);
  });

  it("finds the known helper population", () => {
    expect(helperFiles.length).toBeGreaterThanOrEqual(20);
  });

  it.each(helperFiles.map((f) => [path.relative(SRC, f), f]))("%s", (_rel, file) => {
    const src = read(file as string);
    const valueLines = src.split("\n").filter((l) => /text-2xl font-semibold/.test(l) && /\{value\}/.test(l));
    expect(valueLines.length).toBeGreaterThan(0);
    for (const line of valueLines) {
      expect(line).toMatch(/truncate/);
      expect(line).toMatch(/tabular-nums/);
    }
  });
});

describe("no big currency value renders without truncate", () => {
  // A formatted currency string is one unbreakable token; rendering it at
  // stat size without truncate reintroduces the bleed bug.
  it("every text-xl/2xl/3xl formatCurrency value truncates", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles) {
      for (const line of read(f).split("\n")) {
        if (/text-(xl|2xl|3xl) font-(semibold|bold)/.test(line) && />\{formatCurrency\(/.test(line) && !/truncate/.test(line)) {
          offenders.push(`${path.relative(SRC, f)}: ${line.trim().slice(0, 100)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
