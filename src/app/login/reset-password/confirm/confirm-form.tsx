"use client";

import { useActionState } from "react";
import { confirmResetAction, type ConfirmState } from "../actions";
import { PasswordInput } from "@/components/ui/password-input";

const initial: ConfirmState = { status: "idle" };

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmResetAction, initial);

  if (state.status === "ok") {
    return (
      <div className="login-form">
        <div role="status" className="login-error" style={{ background: "#064e3b", color: "#a7f3d0" }}>
          Password updated. You can now sign in with your new password.
        </div>
        <a href="/login" className="btn-primary" style={{ textAlign: "center", textDecoration: "none" }}>
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="login-form" aria-describedby={state.error ? "confirm-msg" : undefined}>
      {state.status === "error" ? (
        <div id="confirm-msg" role="alert" className="login-error">
          {state.error ?? "Something went wrong. Please try again."}
        </div>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <label htmlFor="new-password" className="form-label">New password</label>
      <PasswordInput
        id="new-password"
        name="password"
        autoComplete="new-password"
        minLength={8}
        required
        disabled={pending}
      />

      <label htmlFor="confirm-password" className="form-label">Confirm new password</label>
      <PasswordInput
        id="confirm-password"
        name="confirm"
        autoComplete="new-password"
        minLength={8}
        required
        disabled={pending}
      />

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
