"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { PasswordInput } from "@/components/ui/password-input";

export function LoginForm({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      // Auth.js v5 returns { error } on bad creds; some paths reject (catch).
      // Always clear loading on failure so the form can't get stuck.
      if (!result || result.error) {
        setError("Email or password is incorrect.");
        setLoading(false);
        return;
      }
      // Navigate to the relative callbackUrl (same-origin path). Avoid
      // result.url — behind a proxy/tunnel it can resolve to the internal
      // origin (e.g. localhost) and break the redirect.
      window.location.href = callbackUrl;
    } catch {
      setError("Email or password is incorrect.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="login-form" aria-describedby={error ? "login-error" : undefined}>
      {error ? (
        <div id="login-error" role="alert" className="login-error">
          {error}
        </div>
      ) : null}

      <label htmlFor="login-email" className="form-label">Email</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="form-input"
        disabled={loading}
      />

      <label htmlFor="login-password" className="form-label">Password</label>
      <PasswordInput
        id="login-password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
      />

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
