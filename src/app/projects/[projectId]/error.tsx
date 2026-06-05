"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Project-scoped error boundary. Catches a throw in any project
 * sub-page (financials, pay-apps, submittals, etc.) so one failing tab
 * shows a recoverable message instead of bubbling to the global error
 * page. Beacons to the same observability sink as the root boundary;
 * never throws from within the handler.
 */
export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[projects/error.tsx]", error);
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
      /* never let monitoring crash the error UI */
    }
  }, [error]);

  return (
    <div className="px-4 py-10 lg:px-6">
      <div className="card mx-auto max-w-lg p-8 text-center" role="alert">
        <h1 className="text-lg font-semibold text-white">This project view hit an error</h1>
        <p className="mt-2 text-sm text-slate-400">
          Something went wrong loading this page. Your data is safe.
          {error.digest ? <> Reference: <code className="font-mono text-xs">{error.digest}</code></> : null}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="btn-primary">Retry</button>
          <Link href="/projects" className="btn-outline">All projects</Link>
        </div>
      </div>
    </div>
  );
}
