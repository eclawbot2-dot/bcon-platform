"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Surfaces a transient toast when the URL contains ?ok=<msg> or
 * ?error=<msg>. Server actions / route handlers use redirect("/foo?ok=Saved")
 * to give users feedback without a separate global state container.
 *
 * Auto-dismisses after 4s and rewrites the URL to drop the query
 * param so a refresh doesn't re-show the same toast. Click to dismiss
 * sooner. Stacks vertically if multiple toasts exist on the page.
 */
export function FlashToast() {
  const router = useRouter();
  const params = useSearchParams();
  const ok = params.get("ok");
  const error = params.get("error");
  const [visible, setVisible] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "error">("ok");

  useEffect(() => {
    if (ok) {
      setVisible(decodeURIComponent(ok));
      setTone("ok");
    } else if (error) {
      setVisible(decodeURIComponent(error));
      setTone("error");
    } else {
      setVisible(null);
    }
  }, [ok, error]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => dismiss(), 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    setVisible(null);
    // Drop ok / error from the URL without triggering a navigation.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("ok");
      url.searchParams.delete("error");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    }
  }

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={dismiss}
      className={`fixed bottom-6 left-4 right-4 z-50 cursor-pointer rounded-lg border px-4 py-3 shadow-xl backdrop-blur-md transition sm:left-auto sm:right-6 sm:max-w-md ${
        tone === "ok"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          : "border-rose-500/40 bg-rose-500/10 text-rose-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm">{tone === "ok" ? "✓" : "✗"}</span>
        <span className="text-sm">{visible}</span>
        <span className="text-[10px] opacity-50">click to dismiss</span>
      </div>
    </div>
  );
}
