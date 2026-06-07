/**
 * Self-service password reset — confirm step. Reached from the emailed
 * link (?token=…). The user sets a new password; on success every
 * existing session for the account is invalidated and they're sent back
 * to sign in.
 */
import { ConfirmForm } from "./confirm-form";

export const metadata = { title: "Set a new password · Construction OS" };

export default async function ConfirmResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="login-shell">
      <div className="login-card">
        <header>
          <div className="login-brand">
            <span className="login-brand-mark" aria-hidden="true">C</span>
            <span className="login-brand-name">Construction OS</span>
          </div>
          <h1>Set a new password</h1>
          <p>Choose a new password for your account.</p>
        </header>
        {token ? (
          <ConfirmForm token={token} />
        ) : (
          <div role="alert" className="login-error">
            This reset link is missing its token. Request a new link from the{" "}
            <a href="/login/reset-password" className="login-link">reset page</a>.
          </div>
        )}
        <p className="login-link-row">
          <a href="/login" className="login-link">
            ← Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
