"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";

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
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (!result || result.error) {
        setError("Email or password is incorrect.");
        return;
      }
      window.location.href = result.url ?? callbackUrl;
    });
  }

  function fillDemo(demoEmail: string, demoPassword: string = "demo1234") {
    setEmail(demoEmail);
    setPassword(demoPassword);
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
        disabled={isPending}
      />

      <label htmlFor="login-password" className="form-label">Password</label>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="form-input"
        disabled={isPending}
      />

      <button type="submit" className="btn-primary" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </button>

      <div className="login-demo-buttons">
        <button type="button" className="btn-outline" onClick={() => fillDemo("trey@jahdev.com", "hadleymaris")} disabled={isPending}>
          Use admin demo
        </button>
        <button type="button" className="btn-outline" onClick={() => fillDemo("pm@construction.local")} disabled={isPending}>
          Use PM demo
        </button>
      </div>
    </form>
  );
}
