import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Construction OS" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  // Open-redirect defense: only accept same-origin relative paths or
  // a path that starts with "/" but doesn't smuggle a protocol-relative
  // "//evil.com" host. Anything else falls back to the home page.
  const rawCallback = params.callbackUrl ?? "/";
  const callbackUrl = isSafeRedirect(rawCallback) ? rawCallback : "/";

  if (session?.userId) redirect(callbackUrl);

  const errorMessage =
    params.error === "CredentialsSignin"
      ? "Email or password is incorrect."
      : params.error
        ? "Sign-in failed. Please try again."
        : null;

  return (
    <main className="login-shell">
      <div className="login-card">
        <header>
          <div className="login-brand">
            <span className="login-brand-mark" aria-hidden="true">C</span>
            <span className="login-brand-name">Construction OS</span>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to your tenant workspace.</p>
        </header>
        <LoginForm callbackUrl={callbackUrl} initialError={errorMessage} />
        <p className="login-link-row">
          <a href="/login/reset-password" className="login-link">
            Forgot your password?
          </a>
        </p>
      </div>
    </main>
  );
}

/**
 * Return true only for callback URLs that are clearly same-origin
 * paths — leading "/" without a second "/" or "\" that would route
 * the redirect to a third-party host. Rejects "//evil.com",
 * "/\\evil.com", "https://...", and anything else funky.
 */
function isSafeRedirect(url: string): boolean {
  if (!url) return false;
  if (url[0] !== "/") return false;
  if (url[1] === "/" || url[1] === "\\") return false;
  // Disallow URLs that contain a colon before the first "/" — catches
  // "javascript:" and similar smuggled schemes if the leading slash
  // was lost upstream.
  if (/^[^/]*:/.test(url.replace(/^\//, ""))) return false;
  return true;
}
