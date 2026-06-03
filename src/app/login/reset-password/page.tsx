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
          <h1>Reset password</h1>
          <p>Enter your account email and we&apos;ll send you a reset link.</p>
        </header>
        <RequestForm />
        <p style={{ marginTop: "1.5rem", fontSize: "0.75rem" }}>
          <a href="/login" style={{ color: "#7dd3fc" }}>
            ← Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
