import { describe, it, expect } from "vitest";
import { checkProdSecrets, assertDeliveryTransports, DEV_VAULT_KEY_DEFAULT } from "../src/lib/env-guard";

/**
 * Production secret guard. In production the app must refuse to boot when
 * AUTH_SECRET/NEXTAUTH_SECRET or BCON_VAULT_KEY is missing or a known
 * dev/CI placeholder. Outside production it must be a silent no-op so
 * local dev + CI keep working with documented dev defaults.
 *
 * Exercised via the pure `checkProdSecrets(env)` form so we never touch
 * the real process.env.
 */

const STRONG = "x".repeat(40);

describe("env-guard checkProdSecrets", () => {
  it("is a no-op outside production even with no secrets", () => {
    expect(() => checkProdSecrets({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => checkProdSecrets({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("throws in production when BCON_VAULT_KEY is missing", () => {
    expect(() =>
      checkProdSecrets({ NODE_ENV: "production", AUTH_SECRET: STRONG } as NodeJS.ProcessEnv),
    ).toThrow(/BCON_VAULT_KEY/);
  });

  it("throws in production when BCON_VAULT_KEY equals the dev default", () => {
    expect(() =>
      checkProdSecrets({
        NODE_ENV: "production",
        BCON_VAULT_KEY: DEV_VAULT_KEY_DEFAULT,
        AUTH_SECRET: STRONG,
      } as NodeJS.ProcessEnv),
    ).toThrow(/placeholder/);
  });

  it("throws in production when AUTH_SECRET/NEXTAUTH_SECRET is missing", () => {
    expect(() =>
      checkProdSecrets({ NODE_ENV: "production", BCON_VAULT_KEY: STRONG } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_SECRET/);
  });

  it("throws in production when a secret is too short", () => {
    expect(() =>
      checkProdSecrets({ NODE_ENV: "production", BCON_VAULT_KEY: "short", AUTH_SECRET: STRONG } as NodeJS.ProcessEnv),
    ).toThrow(/too short/);
  });

  it("passes in production when secrets are strong AND delivery transports are real", () => {
    expect(() =>
      checkProdSecrets({
        NODE_ENV: "production",
        BCON_VAULT_KEY: "a".repeat(40),
        NEXTAUTH_SECRET: "b".repeat(40),
        EMAIL_TRANSPORT: "resend",
        NOTIFY_TRANSPORT: "email",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("throws in production when EMAIL_TRANSPORT is log/unset (mail silently dropped)", () => {
    expect(() =>
      checkProdSecrets({
        NODE_ENV: "production",
        BCON_VAULT_KEY: "a".repeat(40),
        NEXTAUTH_SECRET: "b".repeat(40),
        NOTIFY_TRANSPORT: "email",
      } as NodeJS.ProcessEnv),
    ).toThrow(/EMAIL_TRANSPORT/);
  });
});

describe("env-guard assertDeliveryTransports", () => {
  it("is a no-op outside production", () => {
    expect(() => assertDeliveryTransports({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("throws when NOTIFY_TRANSPORT resolves to console in production", () => {
    expect(() =>
      assertDeliveryTransports({ NODE_ENV: "production", EMAIL_TRANSPORT: "resend", NOTIFY_TRANSPORT: "console" } as NodeJS.ProcessEnv),
    ).toThrow(/NOTIFY_TRANSPORT/);
  });

  it("a RESEND_API_KEY makes NOTIFY_TRANSPORT default to email (no throw)", () => {
    expect(() =>
      assertDeliveryTransports({ NODE_ENV: "production", EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("unset NOTIFY_TRANSPORT with no RESEND_API_KEY throws (resolves to console)", () => {
    expect(() =>
      assertDeliveryTransports({ NODE_ENV: "production", EMAIL_TRANSPORT: "m365" } as NodeJS.ProcessEnv),
    ).toThrow(/console/);
  });
});
