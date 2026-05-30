import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { decryptSecret } from "@/lib/rfp-geo";

/**
 * Validate the tenant's currently-saved AI key by sending a minimal
 * prompt and reporting back. Used by the "Test key" button on
 * /settings — lets the customer verify a freshly-pasted key works
 * before relying on it for billing.
 *
 * Does NOT require ENABLE_LLM_CALLS — the test should run regardless
 * of platform-wide gating because the customer is testing THEIR key.
 *
 * Returns JSON: { ok, provider, latencyMs, error? }.
 */
export async function POST() {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) {
    return NextResponse.json({ ok: false, error: "Manager-level role required." }, { status: 403 });
  }
  const row = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { openaiKeyEnc: true, anthropicKeyEnc: true, preferredProvider: true },
  });
  if (!row) return NextResponse.json({ ok: false, error: "tenant lookup failed" }, { status: 500 });

  const preferred = row.preferredProvider === "anthropic" ? "anthropic" : "openai";
  const enc = preferred === "openai" ? row.openaiKeyEnc : row.anthropicKeyEnc;
  if (!enc) return NextResponse.json({ ok: false, error: `no ${preferred} key on file` }, { status: 400 });

  const key = decryptSecret(tenant.id, enc);
  if (!key) return NextResponse.json({ ok: false, error: "key decrypt failed (vault key may have changed)" }, { status: 500 });

  const start = Date.now();
  try {
    if (preferred === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return NextResponse.json({ ok: false, provider: "openai", error: `${res.status} ${txt.slice(0, 200)}` });
      }
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return NextResponse.json({ ok: false, provider: "anthropic", error: `${res.status} ${txt.slice(0, 200)}` });
      }
    }
    return NextResponse.json({ ok: true, provider: preferred, latencyMs: Date.now() - start });
  } catch (err) {
    return NextResponse.json({ ok: false, provider: preferred, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
