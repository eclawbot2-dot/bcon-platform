/**
 * MailProvider abstraction for workspace-transparency mail ingestion.
 *
 * Two implementations live alongside this file:
 *   - google.ts : Google Workspace via service-account domain-wide delegation.
 *   - m365.ts   : Microsoft 365 via Graph app-only (client-credentials) flow.
 *
 * A provider is constructed from a decrypted MailConnection row and exposes a
 * uniform surface the ingestion pipeline (ingest.ts) drives. Everything is
 * READ-ONLY — listing users and pulling messages. No write/send/modify here.
 */

export type MailUser = {
  /** Primary email address, lowercased. */
  email: string;
  displayName?: string | null;
  /** Provider-stable user id (Graph user id; Gmail uses the email). */
  providerUserId?: string | null;
  /** Suspended/disabled accounts are skipped by the caller. */
  suspended?: boolean;
};

export type MailParsedMessage = {
  /** Provider message id — deduped per mailbox at ingest. */
  externalId: string;
  fromAddress: string;
  fromName: string | null;
  to: string[];
  subject: string | null;
  receivedAt: Date;
  snippet: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
  /** Folder/label names (Gmail labels, Graph parent folder). */
  labels: string[];
};

export interface MailProvider {
  /** Stable provider key: "google" | "m365". */
  readonly key: string;
  /** Verify credentials are usable (token mint + a trivial directory call). */
  verify(): Promise<void>;
  /** Every (non-suspended) user/mailbox in the tenant directory. */
  listUsers(): Promise<MailUser[]>;
  /**
   * Pull recent messages for one mailbox. `since` bounds the window; providers
   * may approximate (Gmail uses newer_than days, Graph uses receivedDateTime).
   */
  pullMessages(userEmail: string, since: Date, max?: number): Promise<MailParsedMessage[]>;
}
