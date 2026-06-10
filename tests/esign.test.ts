import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { esignStatus, sendForSignature, buildDocusignJwt } from "../src/lib/esign";

/**
 * E-sign integration tests — the env-gated DISABLED state must be safe
 * (no network calls, actionable error naming the missing vars) and the
 * DocuSign JWT must be a structurally valid RS256 token.
 */

const FULL_ENV = {
  ESIGN_PROVIDER: "docusign",
  DOCUSIGN_BASE_URL: "https://demo.docusign.net/restapi",
  DOCUSIGN_ACCOUNT_ID: "acct-guid",
  DOCUSIGN_INTEGRATION_KEY: "ik-guid",
  DOCUSIGN_USER_ID: "user-guid",
  DOCUSIGN_PRIVATE_KEY: "pem-placeholder",
} as unknown as NodeJS.ProcessEnv;

describe("esignStatus", () => {
  it("is disabled with everything missing when ESIGN_PROVIDER is unset", () => {
    const s = esignStatus({} as unknown as NodeJS.ProcessEnv);
    expect(s.configured).toBe(false);
    expect(s.provider).toBeNull();
    expect(s.missing).toContain("ESIGN_PROVIDER");
  });

  it("names exactly the missing DOCUSIGN_* vars when the provider is selected", () => {
    const s = esignStatus({ ESIGN_PROVIDER: "docusign", DOCUSIGN_BASE_URL: "https://x" } as unknown as NodeJS.ProcessEnv);
    expect(s.configured).toBe(false);
    expect(s.provider).toBe("docusign");
    expect(s.missing).toEqual([
      "DOCUSIGN_ACCOUNT_ID",
      "DOCUSIGN_INTEGRATION_KEY",
      "DOCUSIGN_USER_ID",
      "DOCUSIGN_PRIVATE_KEY",
    ]);
  });

  it("reports configured when every var is present", () => {
    const s = esignStatus(FULL_ENV);
    expect(s.configured).toBe(true);
    expect(s.missing).toEqual([]);
  });
});

describe("sendForSignature disabled state", () => {
  it("returns ok=false disabled=true (no network) when unconfigured", async () => {
    const res = await sendForSignature(
      { subject: "s", documentName: "d", documentHtml: "<p>/sign-here/</p>", signerName: "A", signerEmail: "a@b.co" },
      {} as unknown as NodeJS.ProcessEnv,
    );
    expect(res.ok).toBe(false);
    expect(res.disabled).toBe(true);
    expect(res.error).toMatch(/ESIGN_PROVIDER/);
  });
});

describe("buildDocusignJwt", () => {
  it("mints a verifiable RS256 JWT with the JWT-grant claims", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = { ...FULL_ENV, DOCUSIGN_PRIVATE_KEY: pem } as unknown as NodeJS.ProcessEnv;

    const jwt = buildDocusignJwt(env, 1_700_000_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(h && c && sig).toBeTruthy();

    const header = JSON.parse(Buffer.from(h!, "base64url").toString());
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });

    const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
    expect(claims.iss).toBe("ik-guid");
    expect(claims.sub).toBe("user-guid");
    expect(claims.aud).toBe("account-d.docusign.com");
    expect(claims.scope).toBe("signature impersonation");
    expect(claims.exp - claims.iat).toBe(3600);

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${h}.${c}`);
    expect(verifier.verify(publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
  });

  it("normalizes \\n-escaped PEM from one-line .env entries", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const escaped = pem.replace(/\n/g, "\\n");
    const env = { ...FULL_ENV, DOCUSIGN_PRIVATE_KEY: escaped } as unknown as NodeJS.ProcessEnv;
    expect(() => buildDocusignJwt(env)).not.toThrow();
  });
});
