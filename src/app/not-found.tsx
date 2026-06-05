import Link from "next/link";

/**
 * Tenant-agnostic 404 page. Doesn't render <AppLayout> because not-found
 * fires from arbitrary contexts (including unauthenticated paths) and
 * AppLayout assumes a tenant. Keeps the same theme tokens as the rest of
 * the app so light/dark both look right.
 */
export default function NotFound() {
  return (
    <main className="login-shell">
      <div className="login-card text-center">
        <header>
          <h1 style={{ color: "var(--heading)" }}>404</h1>
          <p style={{ color: "var(--faint)" }}>That page doesn&apos;t exist or you don&apos;t have access to it.</p>
        </header>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn-primary">Go home</Link>
          <Link href="/login" className="btn-outline">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
