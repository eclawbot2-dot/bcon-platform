"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Server-error boundary. Renders when a server component throws.
 * Logs the error to the browser console for the developer; surfaces a
 * short user-facing message + a `digest` the operator can grep server
 * logs for. Stack traces are intentionally NOT shown — they leak
 * filesystem paths and library internals.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error.tsx]", error);
    // Beacon to the server-side error monitor (cron/audit share the same
    // sink). Best-effort, non-PII: digest + message + path only. Never
    // throws — a monitoring call must not break the error page itself.
    try {
      const body = JSON.stringify({
        digest: error.digest,
        message: error.message,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/observability/client-error", new Blob([body], { type: "application/json" }));
      } else {
        void fetch("/api/observability/client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {
      /* ignore — never let monitoring crash the error UI */
    }
  }, [error]);

  return (
    <main className="login-shell">
      <div className="login-card text-center">
        <header>
          <h1 style={{ color: "var(--heading)" }}>Something went wrong</h1>
          <p style={{ color: "var(--faint)" }}>
            The page hit an unexpected error.
            {error.digest ? (
              <>
                {" "}Reference: <code className="font-mono text-xs">{error.digest}</code>
              </>
            ) : null}
          </p>
        </header>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="btn-primary">Retry</button>
          <Link href="/" className="btn-outline">Go home</Link>
        </div>
      </div>
    </main>
  );
}
