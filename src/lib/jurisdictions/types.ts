/**
 * Shared types for the Charleston-area municipal inspection adapters.
 *
 * Each adapter pulls inspection rows from a city/county permitting
 * portal. Adapters return platform-neutral `FetchedInspection` records
 * that the sync route normalises into our `Inspection` table.
 */

export type AdapterCredentials = {
  username: string | null;
  password: string | null;
};

export type FetchedInspection = {
  /// Portal-side stable id (string). Used as `Inspection.externalId`.
  externalId: string;
  permitNumber: string | null;
  /// Free-text address as the portal reports it. Used to match the
  /// inspection to one of our Project rows when no permit linkage exists.
  address: string | null;
  inspectionType: string;
  /// ISO datetime string. Null if portal only shows date (we promote
  /// to noon-local in the cron to avoid TZ surprises).
  scheduledAt: string | null;
  status: string; // SCHEDULED | COMPLETED | FAILED | CANCELED | UNKNOWN
  result: string | null; // PASS | FAIL | PARTIAL | null
  inspector: string | null;
  notes: string | null;
  sourceUrl: string | null;
};

export type AdapterRunOk = {
  ok: true;
  inspections: FetchedInspection[];
  warnings: string[];
};

export type AdapterRunErr = {
  ok: false;
  reason: "NO_CREDS" | "AUTH_FAILED" | "FETCH_FAILED" | "UNIMPLEMENTED";
  message: string;
};

export type AdapterRunResult = AdapterRunOk | AdapterRunErr;

export type AdapterContext = {
  /// Portal slug (charleston-city, etc.). Adapters can use this when
  /// one adapter implementation serves multiple portals.
  portalSlug: string;
  /// Decrypted credentials. Both fields may be null in stub/demo mode.
  credentials: AdapterCredentials;
  /// Sync watermark — adapters can request only inspections updated
  /// since this time. May be null on first run.
  since: Date | null;
};

export type Adapter = {
  /// Stable adapter id matching `JurisdictionPortal.adapter`.
  key: string;
  label: string;
  fetch: (ctx: AdapterContext) => Promise<AdapterRunResult>;
};
