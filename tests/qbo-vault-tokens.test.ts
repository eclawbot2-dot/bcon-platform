import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/rfp-geo";

/**
 * Vault encryption for QBO OAuth tokens at rest. The QBO connector stores
 * access/refresh tokens through encryptSecret (per-tenant AES-256-GCM key
 * derived from BCON_VAULT_KEY) — these tests pin the properties the
 * connector relies on.
 */

describe("vault token encryption (QBO at-rest storage)", () => {
  const tenantA = "tenant_aaaa";
  const tenantB = "tenant_bbbb";
  const token = "eyJraWQiOiJ0b2tlbiJ9.realistic-oauth-access-token-payload-1234567890";

  it("roundtrips a token for the owning tenant", () => {
    const enc = encryptSecret(tenantA, token);
    expect(enc).toBeTruthy();
    expect(enc).not.toContain(token);
    expect(enc!.startsWith("v1.")).toBe(true);
    expect(decryptSecret(tenantA, enc)).toBe(token);
  });

  it("a DIFFERENT tenant's derived key cannot decrypt (returns null, no throw)", () => {
    const enc = encryptSecret(tenantA, token);
    expect(decryptSecret(tenantB, enc)).toBeNull();
  });

  it("tampered ciphertext fails closed (GCM auth tag)", () => {
    const enc = encryptSecret(tenantA, token)!;
    const parts = enc.split(".");
    const body = Buffer.from(parts[3], "base64");
    body[0] = body[0] ^ 0xff;
    parts[3] = body.toString("base64");
    expect(decryptSecret(tenantA, parts.join("."))).toBeNull();
  });

  it("plaintext legacy/demo placeholders decrypt to null (forces reconnect, never a fake token)", () => {
    // The old demo connector wrote "demo-qbo-access-token" in the same
    // column. The real client must treat that as unusable.
    expect(decryptSecret(tenantA, "demo-qbo-access-token")).toBeNull();
  });

  it("null/empty payloads are null", () => {
    expect(encryptSecret(tenantA, null)).toBeNull();
    expect(encryptSecret(tenantA, "")).toBeNull();
    expect(decryptSecret(tenantA, null)).toBeNull();
    expect(decryptSecret(tenantA, "")).toBeNull();
  });

  it("unique IVs — same plaintext encrypts to different ciphertexts", () => {
    const a = encryptSecret(tenantA, token);
    const b = encryptSecret(tenantA, token);
    expect(a).not.toBe(b);
    expect(decryptSecret(tenantA, a)).toBe(token);
    expect(decryptSecret(tenantA, b)).toBe(token);
  });
});
