/**
 * Deterministic stub data for jurisdiction adapters running without
 * real portal credentials. Lets the UI/cron/notifications loop end-to-end
 * for demo and CI even before the Playwright scrapers are wired in.
 *
 * The generator is keyed by portal slug + the current day-of-year so each
 * portal returns a stable-but-varied set of inspections per day.
 */

import type { FetchedInspection } from "./types";

const INSPECTION_TYPES = [
  "Footing",
  "Framing",
  "Electrical Rough-In",
  "Plumbing Rough-In",
  "Mechanical Rough-In",
  "Insulation",
  "Drywall Nail",
  "Final Building",
  "Final Electrical",
  "Final Plumbing",
  "Final Mechanical",
  "Certificate of Occupancy",
];

const INSPECTORS = [
  "J. Patterson",
  "M. Ravenel",
  "K. Singleton",
  "T. Holcombe",
  "A. Boykin",
];

const ADDRESSES_BY_PORTAL: Record<string, string[]> = {
  "charleston-city": [
    "120 Meeting St, Charleston, SC 29401",
    "47 Wentworth St, Charleston, SC 29401",
    "210 King St, Charleston, SC 29401",
  ],
  "charleston-county": [
    "3424 Maybank Hwy, Johns Island, SC 29455",
    "1750 Folly Rd, Charleston, SC 29412",
  ],
  "berkeley-county": [
    "212 Oakley Plantation Dr, Moncks Corner, SC 29461",
    "104 Crowfield Blvd, Goose Creek, SC 29445",
  ],
  "mt-pleasant": [
    "1450 Long Grove Dr, Mount Pleasant, SC 29464",
    "880 Houston Northcutt Blvd, Mount Pleasant, SC 29464",
  ],
  "north-charleston": [
    "5060 International Blvd, North Charleston, SC 29418",
    "1003 Remount Rd, North Charleston, SC 29406",
  ],
  "dorchester-county": [
    "2120 East Main St, Dorchester, SC 29437",
    "550 Boone Hill Rd, Summerville, SC 29483",
  ],
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function buildStubInspections(portalSlug: string): FetchedInspection[] {
  const addresses = ADDRESSES_BY_PORTAL[portalSlug] ?? [
    "Unknown Address, Charleston, SC",
  ];
  const now = new Date();
  const dayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const baseHash = hashCode(`${portalSlug}:${dayKey}`);

  // 3-6 fake inspections per portal, spread across the next 5 days.
  const count = 3 + (baseHash % 4);
  const out: FetchedInspection[] = [];
  for (let i = 0; i < count; i++) {
    const seed = baseHash + i * 977;
    const dayOffset = (seed % 5); // 0..4 days from today
    const hour = 8 + (seed % 8); // 8am..3pm local
    const scheduled = new Date(now);
    scheduled.setDate(scheduled.getDate() + dayOffset);
    scheduled.setHours(hour, 0, 0, 0);

    const permitNumber = `${portalSlug.toUpperCase().slice(0, 3)}-${(seed % 90000) + 10000}`;
    out.push({
      externalId: `STUB-${portalSlug}-${dayKey}-${i}`,
      permitNumber,
      address: addresses[i % addresses.length],
      inspectionType: INSPECTION_TYPES[seed % INSPECTION_TYPES.length],
      scheduledAt: scheduled.toISOString(),
      status: dayOffset === 0 ? "SCHEDULED" : "SCHEDULED",
      result: null,
      inspector: INSPECTORS[seed % INSPECTORS.length],
      notes: "(demo data — connect real portal credentials in /settings/jurisdictions)",
      sourceUrl: null,
    });
  }
  return out;
}
