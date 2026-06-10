import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the /admin RSC data leak.
 *
 * The admin layout renders an access-denied shell for non-super-admins, but
 * in the App Router layouts and pages render IN PARALLEL: a layout-only check
 * does NOT stop the page server component from executing, and its rendered
 * output (cross-tenant names/slugs, every user's email, platform audit
 * events) ships to the client inside the RSC flight payload even though the
 * layout never composes it visually. Verified live: a plain tenant member
 * fetching /admin/tenants received every tenant slug, and /admin/users
 * received every user email, embedded in the page HTML's flight data.
 *
 * Therefore EVERY page under src/app/admin must gate itself in-component
 * (`if (!(await currentSuperAdmin())) return null;`) before touching data.
 * This test statically enforces that invariant for current and future pages.
 */

const ADMIN_DIR = join(__dirname, "..", "src", "app", "admin");

function collectPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectPages(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

describe("/admin pages gate themselves (not just the layout)", () => {
  const pages = collectPages(ADMIN_DIR);

  it("finds the admin pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  for (const page of pages) {
    const rel = page.split(/[\\/]src[\\/]/)[1];
    it(`src/${rel} calls currentSuperAdmin() before rendering`, () => {
      const src = readFileSync(page, "utf8");
      expect(src, `${rel} must import currentSuperAdmin from @/lib/permissions`).toMatch(
        /import\s*\{[^}]*currentSuperAdmin[^}]*\}\s*from\s*"@\/lib\/permissions"/,
      );
      expect(src, `${rel} must early-return null for non-super-admins`).toMatch(
        /if\s*\(!\(await currentSuperAdmin\(\)\)\)\s*return null;/,
      );
    });
  }
});
