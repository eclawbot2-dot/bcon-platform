/**
 * Registry of Charleston-area municipal inspection adapters.
 *
 * Each entry maps a `JurisdictionPortal.adapter` key to an adapter that
 * knows how to talk to that portal. Today every adapter is a stub that
 * returns deterministic demo data when no credentials are configured;
 * when creds ARE configured, the stub still runs but is marked with a
 * NEEDS_REAL_SCRAPER warning so /inspections/runs surfaces the gap.
 *
 * Adding a real scraper:
 *   1. Replace the `fetch` impl below with a Playwright/Puppeteer call
 *      to the actual portal.
 *   2. Map the portal's response onto `FetchedInspection`.
 *   3. Keep the no-creds branch returning `{ ok: false, reason: "NO_CREDS" }`
 *      so the cron and UI know to ask for credentials.
 */

import type { Adapter, AdapterContext, AdapterRunResult } from "./types";
import { buildStubInspections } from "./stub-data";

function stubAdapter(key: string, label: string): Adapter {
  return {
    key,
    label,
    async fetch(ctx: AdapterContext): Promise<AdapterRunResult> {
      const hasCreds = !!(ctx.credentials.username && ctx.credentials.password);
      const inspections = buildStubInspections(ctx.portalSlug);
      const warnings: string[] = [];
      if (!hasCreds) {
        warnings.push(
          `${ctx.portalSlug}: no credentials configured — returning demo data only`,
        );
      } else {
        warnings.push(
          `${ctx.portalSlug}: real-portal scraper not implemented yet — credentials saved but demo data is being returned`,
        );
      }
      return { ok: true, inspections, warnings };
    },
  };
}

const ADAPTERS: Record<string, Adapter> = {
  "charleston-city": stubAdapter("charleston-city", "City of Charleston (Accela)"),
  "charleston-county": stubAdapter("charleston-county", "Charleston County (Tyler)"),
  "berkeley-county": stubAdapter("berkeley-county", "Berkeley County (Tyler EnerGov)"),
  "mt-pleasant": stubAdapter("mt-pleasant", "Town of Mt Pleasant (Tyler EnerGov)"),
  "north-charleston": stubAdapter("north-charleston", "City of North Charleston (CitizenServe)"),
  "dorchester-county": stubAdapter("dorchester-county", "Dorchester County (Tyler)"),
};

export function getAdapter(key: string): Adapter | null {
  return ADAPTERS[key] ?? null;
}

export function listAdapters(): Adapter[] {
  return Object.values(ADAPTERS);
}

/**
 * Default seed catalog used by both the seed script and the runtime
 * "missing portals" backfill. Keep slug stable — adapter routing
 * depends on it.
 */
export const CHARLESTON_PORTAL_CATALOG = [
  {
    slug: "charleston-city",
    name: "City of Charleston, SC",
    city: "Charleston",
    county: "Charleston",
    state: "SC",
    baseUrl: "https://www.charleston-sc.gov/199/Building-Inspections",
    adapter: "charleston-city",
    platformNote: "Accela Citizen Access",
  },
  {
    slug: "charleston-county",
    name: "Charleston County, SC",
    city: null,
    county: "Charleston",
    state: "SC",
    baseUrl: "https://www.charlestoncounty.org/departments/building-inspections-services/index.php",
    adapter: "charleston-county",
    platformNote: "Tyler Technologies",
  },
  {
    slug: "berkeley-county",
    name: "Berkeley County, SC",
    city: null,
    county: "Berkeley",
    state: "SC",
    baseUrl: "https://berkeleycountysc.gov/dept/building/",
    adapter: "berkeley-county",
    platformNote: "Tyler EnerGov",
  },
  {
    slug: "mt-pleasant",
    name: "Town of Mt Pleasant, SC",
    city: "Mount Pleasant",
    county: "Charleston",
    state: "SC",
    baseUrl: "https://www.tompsc.com/142/Building-Inspections",
    adapter: "mt-pleasant",
    platformNote: "Tyler EnerGov",
  },
  {
    slug: "north-charleston",
    name: "City of North Charleston, SC",
    city: "North Charleston",
    county: "Charleston",
    state: "SC",
    baseUrl: "https://www.northcharleston.org/government/departments/building-inspections/",
    adapter: "north-charleston",
    platformNote: "CitizenServe",
  },
  {
    slug: "dorchester-county",
    name: "Dorchester County, SC",
    city: null,
    county: "Dorchester",
    state: "SC",
    baseUrl: "https://www.dorchestercountysc.gov/government/county-departments/building-services",
    adapter: "dorchester-county",
    platformNote: "Tyler Technologies",
  },
] as const;
