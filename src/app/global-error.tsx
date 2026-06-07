"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Root-level error boundary. This is the ONLY boundary that catches an
 * error thrown by the root layout itself (src/app/layout.tsx) — at that
 * point the normal error.tsx boundary can't render because it lives
 * *inside* the layout that failed. Without this file, such an error falls
 * through to Next.js's built-in fallback, which in production is a bare
 * unstyled "Application error" page.
 *
 * Because it replaces the whole document, global-error MUST render its own
 * <html>/<body> and cannot rely on the app's global stylesheet (the layout
 * that imports it is the thing that broke), so styling is inlined.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error.tsx]", error);
    // Best-effort beacon to the server-side monitor. Never throws — a
    // failed monitoring call must not break the last-resort error page.
    try {
      const body = JSON.stringify({
        digest: error.digest,
        message: error.message,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        scope: "global-error",
      });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          "/api/observability/client-error",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        void fetch("/api/observability/client-error", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore — never let monitoring crash the error UI */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 420,
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0 0 1.5rem" }}>
            The application hit an unexpected error.
            {error.digest ? (
              <>
                {" "}Reference:{" "}
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>
                  {error.digest}
                </code>
              </>
            ) : null}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 8,
                border: "none",
                background: "#22d3ee",
                color: "#0f172a",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <Link
              href="/"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 8,
                border: "1px solid #334155",
                color: "#e2e8f0",
                textDecoration: "none",
              }}
            >
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
