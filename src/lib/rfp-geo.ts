/**
 * Geo-aware solicitation portal discovery + encrypted credential
 * storage for watched sources.
 *
 * The catalog is seeded with well-known US procurement portals
 * tagged by geography/category. Given a city/state, we surface
 * matches and let the user one-click "Watch". When a source needs
 * auth, credentials are stored encrypted at rest with a per-tenant
 * key so nothing is in plaintext in the DB.
 */

import crypto from "node:crypto";
import { DEV_VAULT_KEY_DEFAULT } from "@/lib/env-guard";

// Importing env-guard runs assertProdSecrets() at load time, which throws
// in production when BCON_VAULT_KEY is missing or equals the dev default
// below — so we can never silently ship the dev key to prod.
const MASTER_KEY = process.env.BCON_VAULT_KEY ?? DEV_VAULT_KEY_DEFAULT;

function deriveKey(tenantId: string): Buffer {
  return crypto.createHash("sha256").update(`${MASTER_KEY}:${tenantId}`).digest();
}

export function encryptSecret(tenantId: string, plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const key = deriveKey(tenantId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(tenantId: string, payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [v, ivB64, tagB64, encB64] = payload.split(".");
    if (v !== "v1") return null;
    const key = deriveKey(tenantId);
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const enc = Buffer.from(encB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(payload: string | null | undefined): string {
  if (!payload) return "—";
  return "••••••••";
}

/**
 * Known public procurement + solicitation portals by geography.
 * Used to power "discover watchable sites near me."
 *
 * Each entry is a genuine working portal URL; the auth hints tell the
 * user whether the source is public (no login needed), requires a
 * free account, or needs an API key.
 */
export const PORTAL_CATALOG: Array<{
  name: string;
  url: string;
  category: "federal" | "state" | "local" | "aggregator" | "industry";
  geoScope: "federal" | "state" | "metro" | "county" | "city";
  geoState?: string;
  geoCity?: string;
  authType: "NONE" | "FREE_ACCOUNT" | "PAID_ACCOUNT" | "API_KEY";
  signupUrl?: string;
  description: string;
  naicsFocus?: string;
}> = [
  // Federal
  { name: "SAM.gov", url: "https://sam.gov/search/?index=opp", category: "federal", geoScope: "federal", authType: "FREE_ACCOUNT", signupUrl: "https://sam.gov/content/home", description: "Primary federal contract opportunity portal (replaced FedBizOpps)." },
  { name: "NAVFAC eSolicitations", url: "https://www.navfac.navy.mil/navfac_worldwide/atlantic.html", category: "federal", geoScope: "federal", authType: "NONE", description: "Naval Facilities Engineering Systems Command opportunities." },
  { name: "USACE Mobile District", url: "https://www.sam.usace.army.mil/Missions/Contracting/", category: "federal", geoScope: "federal", authType: "NONE", description: "US Army Corps of Engineers construction opportunities." },

  // Aggregators
  { name: "BidNet Direct", url: "https://www.bidnetdirect.com", category: "aggregator", geoScope: "federal", authType: "PAID_ACCOUNT", signupUrl: "https://www.bidnetdirect.com/register", description: "Multi-state aggregator of state/local RFPs." },
  { name: "ConstructConnect", url: "https://www.constructconnect.com", category: "aggregator", geoScope: "federal", authType: "PAID_ACCOUNT", signupUrl: "https://www.constructconnect.com/free-trial", description: "Construction bid opportunity aggregator." },
  { name: "Dodge Data & Analytics", url: "https://www.construction.com", category: "aggregator", geoScope: "federal", authType: "PAID_ACCOUNT", signupUrl: "https://www.construction.com/plans-pricing", description: "Leading construction intelligence and bid source." },
  { name: "PlanHub", url: "https://planhub.com", category: "aggregator", geoScope: "federal", authType: "FREE_ACCOUNT", signupUrl: "https://planhub.com/register", description: "Free bid board for GCs and subs; especially strong Southeast coverage." },

  // South Carolina
  { name: "SCDOT Bid Lettings", url: "https://www.scdot.org/business/business-letting.aspx", category: "state", geoScope: "state", geoState: "SC", authType: "NONE", description: "South Carolina DOT highway/bridge lettings.", naicsFocus: "237310" },
  { name: "SC Procurement Services Division", url: "https://procurement.sc.gov/vendor/bids-solicitations", category: "state", geoScope: "state", geoState: "SC", authType: "FREE_ACCOUNT", description: "State of South Carolina agency procurements." },
  { name: "Charleston County Procurement", url: "https://www.charlestoncounty.org/departments/procurement/current-bids.php", category: "local", geoScope: "county", geoState: "SC", geoCity: "Charleston", authType: "NONE", description: "Charleston County, SC open solicitations." },
  { name: "City of Charleston Bids", url: "https://www.charleston-sc.gov/bids.aspx", category: "local", geoScope: "city", geoState: "SC", geoCity: "Charleston", authType: "NONE", description: "City of Charleston, SC procurement." },
  { name: "North Charleston eBid", url: "https://www.northcharleston.org/Business/Bidding-Opportunities.aspx", category: "local", geoScope: "city", geoState: "SC", geoCity: "North Charleston", authType: "NONE", description: "City of North Charleston construction/services bids." },
  { name: "Mount Pleasant Procurement", url: "https://www.tompsc.com/bids.aspx", category: "local", geoScope: "city", geoState: "SC", geoCity: "Mount Pleasant", authType: "NONE", description: "Town of Mount Pleasant, SC open bids." },
  { name: "Charleston Water System", url: "https://www.charlestonwater.com/163/Bid-Opportunities", category: "local", geoScope: "metro", geoState: "SC", geoCity: "Charleston", authType: "NONE", description: "Charleston Water System utility bid board." },

  // North Carolina
  { name: "NCDOT Current Lettings", url: "https://connect.ncdot.gov/letting/Pages/default.aspx", category: "state", geoScope: "state", geoState: "NC", authType: "NONE", description: "North Carolina DOT project lettings." },
  { name: "NC eProcurement", url: "https://eprocurement.nc.gov", category: "state", geoScope: "state", geoState: "NC", authType: "FREE_ACCOUNT", description: "State of NC central eProcurement." },

  // Georgia
  { name: "GDOT Construction Lettings", url: "https://www.dot.ga.gov/PS/Business/Source", category: "state", geoScope: "state", geoState: "GA", authType: "NONE", description: "Georgia DOT construction project opportunities." },
  { name: "Georgia Procurement Registry", url: "https://ssl.doas.state.ga.us/gpr/search", category: "state", geoScope: "state", geoState: "GA", authType: "NONE", description: "State of Georgia agency procurements." },

  // Florida
  { name: "FDOT Lettings", url: "https://www.fdot.gov/contracts/", category: "state", geoScope: "state", geoState: "FL", authType: "NONE", description: "Florida DOT construction lettings." },
  { name: "MyFloridaMarketPlace", url: "https://www.myfloridamarketplace.com", category: "state", geoScope: "state", geoState: "FL", authType: "FREE_ACCOUNT", description: "State of Florida eProcurement system." },
  { name: "Miami-Dade Procurement", url: "https://www.miamidade.gov/procurement", category: "local", geoScope: "county", geoState: "FL", geoCity: "Miami", authType: "NONE", description: "Miami-Dade County procurement." },

  // Virginia
  { name: "eVA Virginia eMall", url: "https://eva.virginia.gov", category: "state", geoScope: "state", geoState: "VA", authType: "FREE_ACCOUNT", description: "Commonwealth of Virginia eProcurement." },
  { name: "VDOT Construction Lettings", url: "https://www.virginiadot.org/business/const/default.asp", category: "state", geoScope: "state", geoState: "VA", authType: "NONE", description: "Virginia DOT construction projects." },

  // Texas
  { name: "TxDOT Bid Lettings", url: "https://www.txdot.gov/business/letting-bids.html", category: "state", geoScope: "state", geoState: "TX", authType: "NONE", description: "Texas DOT project lettings." },
  { name: "Texas SmartBuy", url: "https://comptroller.texas.gov/purchasing/", category: "state", geoScope: "state", geoState: "TX", authType: "NONE", description: "State of Texas central procurement." },
];

/** Return the portals relevant to a geography. Empty geoState returns federal + aggregators + federal-scope portals. */
export function discoverPortalsForGeo(opts: { state?: string | null; city?: string | null }): typeof PORTAL_CATALOG {
  const state = opts.state?.toUpperCase().trim() || null;
  const city = opts.city?.toLowerCase().trim() || null;
  return PORTAL_CATALOG.filter((p) => {
    if (p.geoScope === "federal") return true;
    if (state && p.geoState && p.geoState.toUpperCase() === state) {
      if (city && p.geoCity) return p.geoCity.toLowerCase() === city || p.geoScope === "state";
      return true;
    }
    return false;
  });
}
