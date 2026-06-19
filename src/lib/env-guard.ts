/**
 * Production secret guard.
 *
 * Several modules fall back to hardcoded dev defaults when a secret env
 * var is unset (so local dev + CI work without ceremony). That fallback
 * is a liability in production: shipping with the well-known dev key
 * silently makes every encrypted-at-rest secret trivially decryptable,
 * and a missing/weak AUTH_SECRET undermines session integrity.
 *
 * This module centralizes the "refuse to boot in prod with a dev/empty
 * secret" check. It is intentionally a no-op outside production so tests
 * and local dev keep working with the documented dev defaults.
 *
 * Import order matters: importing this module runs the guard at load
 * time. `rfp-geo.ts` and `auth.ts` both import it so any code path that
 * touches the vault or auth trips the guard before doing crypto.
 */

/** The well-known dev fallback key in rfp-geo.ts. Kept in sync here so
 *  the guard can reject it explicitly even if someone copies it into a
 *  prod .env by mistake. */
export const DEV_VAULT_KEY_DEFAULT = "bcon-local-dev-key-change-in-prod-!!!!!!";

/** Values we treat as "obviously not a real production secret". */
const KNOWN_WEAK_VALUES = new Set<string>([
  DEV_VAULT_KEY_DEFAULT,
  "ci-vault-key-not-for-production",
  "ci-test-secret-not-for-production",
  "changeme",
  "secret",
  "dev",
  "",
]);

function assertStrong(name: string, value: string | undefined, opts?: { minLen?: number }): void {
  const minLen = opts?.minLen ?? 16;
  const v = (value ?? "").trim();
  if (!v) {
    throw new Error(
      `[env-guard] ${name} is required in production but is missing/empty. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  if (KNOWN_WEAK_VALUES.has(v)) {
    throw new Error(`[env-guard] ${name} is set to a known dev/CI placeholder value; refusing to boot in production.`);
  }
  if (v.length < minLen) {
    throw new Error(`[env-guard] ${name} is too short (<${minLen} chars) for production use.`);
  }
}

/**
 * Pure secret validator over an env-like map. Exported for tests so the
 * checks can be exercised without process.env mutation gymnastics. Throws
 * the first failure; no-op when nodeEnv !== "production".
 */
export function checkProdSecrets(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  // Per-tenant vault encryption key (rfp-geo.ts deriveKey).
  assertStrong("BCON_VAULT_KEY", env.BCON_VAULT_KEY);
  // NextAuth secret — accept either env name (NextAuth v5 reads both).
  assertStrong("AUTH_SECRET/NEXTAUTH_SECRET", env.AUTH_SECRET ?? env.NEXTAUTH_SECRET);
  // Delivery transports must not be no-op in production: a "log" email
  // transport silently drops password resets/invites, and a "console" notify
  // transport means computed alerts never reach a human.
  assertDeliveryTransports(env);
}

/**
 * Refuse to boot in production with a no-delivery email or notification
 * transport. Kept here (no imports of email.ts/notify.ts) to avoid pulling
 * those modules — and their side effects — into the boot guard.
 */
export function assertDeliveryTransports(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const emailTransport = (env.EMAIL_TRANSPORT ?? "log").toLowerCase();
  if (emailTransport === "log") {
    throw new Error(
      "[env-guard] EMAIL_TRANSPORT is 'log' (or unset) in production — emails (password resets, invites, alerts) " +
        "would be silently dropped. Set EMAIL_TRANSPORT to resend/m365/sendgrid/smtp and configure its credentials.",
    );
  }
  let notifyTransport = (env.NOTIFY_TRANSPORT ?? "").toLowerCase();
  if (!notifyTransport) notifyTransport = env.RESEND_API_KEY ? "email" : "console";
  if (notifyTransport === "console" || notifyTransport === "noop") {
    throw new Error(
      `[env-guard] NOTIFY_TRANSPORT resolves to '${notifyTransport}' in production — computed alerts would never reach a human. ` +
        "Set NOTIFY_TRANSPORT=email (or =resend with RESEND_API_KEY).",
    );
  }
}

let ran = false;

/**
 * Validate that production-critical secrets are present and not dev
 * defaults. Throws (crashing the process / failing the request) when a
 * secret is missing or weak in production. No-op outside production.
 *
 * Idempotent: safe to call from multiple module-load sites.
 */
export function assertProdSecrets(): void {
  if (ran) return;
  ran = true;
  checkProdSecrets(process.env);
}

// Run on import so prod misconfiguration fails fast at boot.
assertProdSecrets();
