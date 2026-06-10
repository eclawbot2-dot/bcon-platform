/**
 * Project-site maps — env-gated embed, zero-config link fallback.
 *
 * Projects carry a free-text street address. Two levels of map support:
 *
 *   1. mapLinkForAddress(): ALWAYS available — a plain Google Maps search
 *      URL the browser opens in a new tab. No API key, no quota, no PII
 *      sent from the server (the user's own browser resolves it).
 *
 *   2. mapEmbedUrl(): an inline <iframe> embed of the site location,
 *      activated only when GOOGLE_MAPS_EMBED_API_KEY is set (Google Maps
 *      Embed API — free tier, key restricted by referrer). Disabled state
 *      returns null and the UI simply renders the link instead.
 */

export function mapLinkForAddress(address: string | null | undefined): string | null {
  const a = (address ?? "").trim();
  if (!a) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

export function mapEmbedUrl(
  address: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const a = (address ?? "").trim();
  const key = (env.GOOGLE_MAPS_EMBED_API_KEY ?? "").trim();
  if (!a || !key) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(a)}`;
}
