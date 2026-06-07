"use server";

import { headers } from "next/headers";
import { requestPasswordReset, confirmPasswordReset } from "@/lib/auth/password-reset";

function clientIp(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "?"
  );
}

function origin(h: Headers): string | undefined {
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${proto}://${host}` : undefined;
}

export type RequestState = { status: "idle" | "sent" | "not_found" | "rate_limited" | "error" };

/** Server action for the "forgot password" form. */
export async function requestResetAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const email = String(formData.get("email") ?? "");
  if (!email.trim()) return { status: "error" };
  const h = await headers();
  try {
    const res = await requestPasswordReset({ email, ip: clientIp(h), origin: origin(h) });
    return { status: res.status };
  } catch {
    return { status: "error" };
  }
}

export type ConfirmState = { status: "idle" | "ok" | "error"; error?: string };

/** Server action for the "set a new password" form. */
export async function confirmResetAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { status: "error", error: "Passwords don't match." };
  try {
    const res = await confirmPasswordReset({ token, password });
    if (res.ok) return { status: "ok" };
    return { status: "error", error: res.error };
  } catch {
    // A DB/transaction failure during the reset shouldn't throw the user
    // into the error boundary mid-flow — surface a retryable inline error
    // (matches requestResetAction's handling).
    return { status: "error", error: "Something went wrong. Please try again." };
  }
}
