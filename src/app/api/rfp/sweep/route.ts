import { sweepAllSources } from "@/lib/rfp-autopilot";
import { requireTenant } from "@/lib/tenant";
import { publicRedirect } from "@/lib/redirect";

/**
 * Tenant-facing sweep trigger — runs sweep across THIS tenant's active
 * sources only, then redirects back to /bids/sources.
 *
 * Previously this called sweepAllSources() with no argument, which crawls
 * every tenant's sources platform-wide. Any authenticated user could thus
 * trigger work (and incur scrape cost) against other tenants' sources.
 * Scoping to requireTenant().id keeps the trigger inside the caller's
 * tenant; the unscoped sweep remains available only to the bearer-token
 * cron at /api/cron/rfp-sweep.
 */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  await sweepAllSources(tenant.id);
  return publicRedirect(req, `/bids/sources`, 303);
}
