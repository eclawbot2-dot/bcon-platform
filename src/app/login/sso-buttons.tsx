"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const PROVIDER_LABELS: Record<string, string> = {
  okta: "Okta",
  "azure-ad": "Microsoft Entra ID",
  google: "Google",
  auth0: "Auth0",
};

/**
 * "Continue with <IdP>" buttons for whichever SSO providers are
 * env-configured (see src/lib/sso-providers.ts). The server page
 * passes the active provider ids; nothing renders when SSO is off,
 * so password-only deployments see no change.
 */
export function SsoButtons({ providerIds, callbackUrl }: { providerIds: string[]; callbackUrl: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (providerIds.length === 0) return null;

  return (
    <div className="login-sso">
      <div className="login-sso-divider" role="separator" aria-label="or continue with single sign-on">
        <span>or</span>
      </div>
      <div className="login-sso-buttons">
        {providerIds.map((id) => (
          <button
            key={id}
            type="button"
            className="btn-outline w-full"
            disabled={busy !== null}
            onClick={() => {
              setBusy(id);
              // Full-page OAuth redirect; next-auth handles the round trip
              // and lands back on callbackUrl after the IdP exchange.
              void signIn(id, { callbackUrl });
            }}
          >
            {busy === id ? "Redirecting…" : `Continue with ${PROVIDER_LABELS[id] ?? id}`}
          </button>
        ))}
      </div>
    </div>
  );
}
