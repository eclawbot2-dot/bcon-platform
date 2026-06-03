"use client";

import { useActionState } from "react";
import { requestResetAction, type RequestState } from "./actions";

const initial: RequestState = { status: "idle" };

export function RequestForm() {
  const [state, action, pending] = useActionState(requestResetAction, initial);

  return (
    <form action={action} className="login-form" aria-describedby="reset-msg">
      {state.status === "sent" ? (
        <div id="reset-msg" role="status" className="login-error" style={{ background: "#064e3b", color: "#a7f3d0" }}>
          Email sent. Check your inbox for a reset link (valid for 1 hour).
        </div>
      ) : null}
      {state.status === "not_found" ? (
        <div id="reset-msg" role="alert" className="login-error">
          Email not found.
        </div>
      ) : null}
      {state.status === "rate_limited" ? (
        <div id="reset-msg" role="alert" className="login-error">
          Too many requests. Please try again in a few minutes.
        </div>
      ) : null}
      {state.status === "error" ? (
        <div id="reset-msg" role="alert" className="login-error">
          Something went wrong. Please try again.
        </div>
      ) : null}

      <label htmlFor="reset-email" className="form-label">Email</label>
      <input
        id="reset-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        className="form-input"
        disabled={pending}
      />

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
