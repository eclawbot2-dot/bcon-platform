/**
 * Self-service password reset — request step. The user enters their
 * email; if it belongs to an active account we email a single-use reset
 * link and show "Email sent." If not, we show "Email not found." (an
 * explicit product choice over anti-enumeration silence). No tenant-admin
 * round-trip required.
 */
import { RequestForm } from "./request-form";

export const metadata = { title: "Reset password · Construction OS" };

export default function ResetPasswordPage() {
  return (
    <main className="login-shell">
      <div className="login-card">
        <header>
          <div className="login-brand">
            <span className="login-brand-mark" aria-hidden="true">C</span>
            <span className="login-brand-name">Construction OS</span>
          </div>
          <h1>Reset password</h1>
          <p>Enter your account email and we&apos;ll send you a reset link.</p>
        </header>
        <RequestForm />
        <p className="login-link-row">
          <a href="/login" className="login-link">
            ← Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
