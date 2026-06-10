/**
 * E-signature integration — env-gated, DocuSign JWT-grant structure.
 *
 * Construction pay applications (AIA G702) and contracts legally require
 * wet/electronic signatures from the contractor + owner/architect. This
 * module gives the platform a single e-sign surface that is DISABLED by
 * default and activates only when a DocuSign app is configured:
 *
 *   ESIGN_PROVIDER=docusign
 *   DOCUSIGN_BASE_URL=https://demo.docusign.net/restapi   (prod: na*.docusign.net)
 *   DOCUSIGN_OAUTH_HOST=account-d.docusign.com            (prod: account.docusign.com)
 *   DOCUSIGN_ACCOUNT_ID=<API account id (GUID)>
 *   DOCUSIGN_INTEGRATION_KEY=<integration key (GUID)>
 *   DOCUSIGN_USER_ID=<impersonated user id (GUID)>
 *   DOCUSIGN_PRIVATE_KEY=<RSA private key PEM — \n-escaped or raw multiline>
 *
 * Flow (JWT grant, server-to-server — no per-user OAuth dance):
 *   1. Mint an RS256 JWT (iss=integration key, sub=user id, aud=oauth host,
 *      scope="signature impersonation") signed with the app's RSA key.
 *   2. Exchange it at https://<oauth-host>/oauth/token for an access token.
 *   3. POST an envelope (HTML document + anchor-positioned sign tab) to
 *      /v2.1/accounts/<account>/envelopes; DocuSign emails the signer.
 *
 * When unconfigured every call returns { ok:false, disabled:true } with the
 * exact missing env var names — callers surface that as a 503 + settings
 * hint, never a crash. See docs/integrations.md for setup.
 */

import crypto from "node:crypto";

export type EsignStatus = {
  /** True when every required env var is present. */
  configured: boolean;
  provider: "docusign" | null;
  /** Names of the env vars still missing (never values). */
  missing: string[];
};

export type EsignSendResult = {
  ok: boolean;
  /** True when the failure is "integration not configured" (vs. a runtime error). */
  disabled?: boolean;
  envelopeId?: string;
  error?: string;
};

const REQUIRED_VARS = [
  "DOCUSIGN_BASE_URL",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_PRIVATE_KEY",
] as const;

/** Report configuration state for settings pages / route guards. */
export function esignStatus(env: NodeJS.ProcessEnv = process.env): EsignStatus {
  const provider = (env.ESIGN_PROVIDER ?? "").toLowerCase();
  if (provider !== "docusign") {
    // Not selected at all — report everything needed to switch it on.
    return { configured: false, provider: null, missing: ["ESIGN_PROVIDER", ...REQUIRED_VARS] };
  }
  const missing = REQUIRED_VARS.filter((name) => !(env[name] ?? "").trim());
  return { configured: missing.length === 0, provider: "docusign", missing: [...missing] };
}

/** Normalize a PEM that may arrive \n-escaped from a one-line .env entry. */
function normalizePem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Mint the RS256 JWT for DocuSign's JWT-grant flow. Exported for tests. */
export function buildDocusignJwt(env: NodeJS.ProcessEnv = process.env, now: number = Date.now()): string {
  const oauthHost = (env.DOCUSIGN_OAUTH_HOST ?? "account-d.docusign.com").trim();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const claims = b64url(
    JSON.stringify({
      iss: env.DOCUSIGN_INTEGRATION_KEY,
      sub: env.DOCUSIGN_USER_ID,
      aud: oauthHost,
      iat,
      exp: iat + 3600,
      scope: "signature impersonation",
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(normalizePem(env.DOCUSIGN_PRIVATE_KEY ?? "")).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

async function fetchAccessToken(env: NodeJS.ProcessEnv): Promise<string> {
  const oauthHost = (env.DOCUSIGN_OAUTH_HOST ?? "account-d.docusign.com").trim();
  const assertion = buildDocusignJwt(env);
  const res = await fetch(`https://${oauthHost}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`docusign oauth ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("docusign oauth: no access_token in response");
  return json.access_token;
}

export type EnvelopeRequest = {
  /** Email subject line the signer sees. */
  subject: string;
  /** Human-readable document name (e.g. "Pay Application #4 — G702"). */
  documentName: string;
  /** Full HTML body of the document to be signed. */
  documentHtml: string;
  signerName: string;
  signerEmail: string;
};

/**
 * Create and send a DocuSign envelope for `doc`, signature anchored to the
 * literal string "/sign-here/" in the HTML (include it where the signature
 * line belongs). Returns the envelope id on success; a disabled-state result
 * when the integration is not configured.
 */
export async function sendForSignature(
  doc: EnvelopeRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EsignSendResult> {
  const status = esignStatus(env);
  if (!status.configured) {
    return {
      ok: false,
      disabled: true,
      error: `e-sign not configured — set ${status.missing.join(", ")} (see docs/integrations.md)`,
    };
  }

  try {
    const token = await fetchAccessToken(env);
    const base = (env.DOCUSIGN_BASE_URL ?? "").replace(/\/$/, "");
    const accountId = env.DOCUSIGN_ACCOUNT_ID;
    const res = await fetch(`${base}/v2.1/accounts/${accountId}/envelopes`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        emailSubject: doc.subject,
        status: "sent",
        documents: [
          {
            documentBase64: Buffer.from(doc.documentHtml, "utf8").toString("base64"),
            name: doc.documentName,
            fileExtension: "html",
            documentId: "1",
          },
        ],
        recipients: {
          signers: [
            {
              email: doc.signerEmail,
              name: doc.signerName,
              recipientId: "1",
              routingOrder: "1",
              tabs: {
                signHereTabs: [
                  { anchorString: "/sign-here/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "0" },
                ],
              },
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `docusign envelope ${res.status}: ${detail.slice(0, 300)}` };
    }
    const json = (await res.json()) as { envelopeId?: string };
    return { ok: true, envelopeId: json.envelopeId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
