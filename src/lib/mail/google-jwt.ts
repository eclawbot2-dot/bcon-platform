/**
 * Service-account JWT auth for Google APIs (domain-wide delegation).
 *
 * Ported from the psd reference implementation (lib/integrations/google-jwt.ts).
 * Signs an RS256 JWT off the service account's private key, exchanges it for an
 * OAuth access token, optionally impersonating a workspace user via the `sub`
 * claim. Tokens cache for their lifetime (~1h) keyed by
 * (service-account-email, sub, scope) so per-user calls stay cheap.
 */

import crypto from "node:crypto";

export type ServiceAccountKey = {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key: string; // PEM, includes BEGIN/END PRIVATE KEY
  client_email: string; // service account email
  client_id?: string;
  token_uri?: string;
};

type CacheEntry = { token: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64url(input: Buffer | string): string {
  const b = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function parseServiceAccountKey(json: string): ServiceAccountKey {
  const obj = JSON.parse(json) as ServiceAccountKey;
  if (!obj.private_key || !obj.client_email) {
    throw new Error("service account JSON missing private_key or client_email");
  }
  return obj;
}

/**
 * Exchange a service-account-signed JWT for an access token. Pass `subject`
 * (a workspace user's email) to invoke domain-wide delegation — the resulting
 * token acts as that user. `scopes` is space-separated.
 */
export async function getServiceAccountToken(
  key: ServiceAccountKey,
  scopes: string,
  subject?: string,
): Promise<string> {
  const cacheKey = `${key.client_email}|${subject || ""}|${scopes}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims: Record<string, unknown> = {
    iss: key.client_email,
    scope: scopes,
    aud: key.token_uri || DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };
  if (subject) claims.sub = subject;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(key.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(key.token_uri || DEFAULT_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`google token exchange failed: ${res.status} ${t}`);
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(cacheKey, { token: tok.access_token, expiresAt: Date.now() + tok.expires_in * 1000 });
  return tok.access_token;
}

/** Thin fetch wrapper that adds the bearer header and throws on non-2xx. */
export async function gapi<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`google api ${url} ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}
