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

/**
 * One Drive/OneDrive file, normalized across providers. READ-ONLY metadata —
 * we never download or mutate content here, just surface what exists for
 * org transparency.
 */
export type WorkspaceDriveFile = {
  /** Provider file id. */
  id: string;
  name: string;
  /** MIME type (Google: mimeType; Graph: file.mimeType / "folder"). */
  mimeType: string | null;
  /** Bytes, when the provider reports it. */
  size: number | null;
  modifiedAt: Date | null;
  /** A read-only link to view in the provider UI, when available. */
  webUrl: string | null;
  /** True for folders (Drive folder mimeType / Graph folder facet). */
  isFolder: boolean;
};

/** One calendar event, normalized across providers. READ-ONLY. */
export type WorkspaceCalendarEvent = {
  id: string;
  subject: string | null;
  start: Date | null;
  end: Date | null;
  /** Whether the event is marked all-day. */
  allDay: boolean;
  location: string | null;
  /** Organizer email, when reported. */
  organizer: string | null;
  /** Attendee emails (bounded). */
  attendees: string[];
};

export type WorkspaceListOpts = {
  /** Upper bound on returned items (providers clamp to a hard ceiling). */
  max?: number;
  /** For calendar: only events on/after this instant (defaults to now). */
  since?: Date;
};

/**
 * Provider surface for read-only Workspace transparency. Originally mail-only
 * (hence the name); now also exposes ad-hoc Drive + Calendar reads. Everything
 * is READ-ONLY — listing users and pulling messages/files/events. No
 * write/send/modify anywhere in any implementation.
 */
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
  /**
   * List a user's Drive/OneDrive files (read-only metadata, bounded). On-demand
   * transparency read — NOT ingested or persisted.
   */
  listDriveFiles(userEmail: string, opts?: WorkspaceListOpts): Promise<WorkspaceDriveFile[]>;
  /**
   * List a user's upcoming calendar events (read-only, bounded). On-demand
   * transparency read — NOT ingested or persisted.
   */
  listCalendarEvents(userEmail: string, opts?: WorkspaceListOpts): Promise<WorkspaceCalendarEvent[]>;
}
