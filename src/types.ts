/*
 * Request and response shapes of the SendClipper REST API (`/v1`).
 *
 * The API only ever ADDS fields inside `/v1`; it never removes or retypes
 * one. Responses may therefore carry fields not listed here.
 */

/* ------------------------------------------------------------------ shared */

/** Values for `{{tags}}`: a flat object of tag → string / number / boolean. */
export type TemplateVariables = Record<string, string | number | boolean>;

export type SendClass = 'transactional' | 'marketing';

export type DomainRegion = 'us-east-1' | 'eu-west-1' | 'us-west-2';

/** A list page addressed by number. */
export interface NumberedPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** A list page addressed by an opaque cursor. */
export interface CursorPage<T> {
  data: T[];
  page: { cursor: string | null; hasMore: boolean };
}

/* ------------------------------------------------------------------ emails */

interface SendEmailBase {
  /** A bare address on a verified domain: `hello@send.acme.io`. A display-name form is refused. */
  from: string;
  /** ONE recipient. For several, use `emails.sendBatch()` with one item each. */
  to: string;
  /** Plain-text alternative. */
  text?: string;
  /** Fills `{{tags}}` in a template, or in a hand-written `html` body. */
  variables?: TemplateVariables;
  /** `transactional` (default) or `marketing`. Marketing adds one-click unsubscribe and the postal-address footer. */
  sendClass?: SendClass;
  /** `false` leaves the open-tracking pixel out. Default `true`. */
  trackOpens?: boolean;
  /** `false` leaves links unwrapped. Default `true`. */
  trackClicks?: boolean;
  /**
   * Where replies go: one bare address or a list of up to 10, sent as the
   * `Reply-To` header. Omitted, replies go to `from`.
   */
  replyTo?: string | string[];
  /**
   * Files sent with the message (not on a batch item). `content` is the
   * file's bytes, or already base64. Limits: 10 MiB per file and 25 MiB per
   * message by default, plus the sending provider's own.
   */
  attachments?: EmailAttachment[];
}

/** One file on `emails.send()` / `sandboxes.send()`. */
export interface EmailAttachment {
  /** The name the recipient sees, e.g. `invoice-42.pdf`. */
  filename: string;
  /** The bytes (`Buffer`/`Uint8Array`), or a base64 string. */
  content: Uint8Array | string;
  /** e.g. `application/pdf`. Guessed from the filename when omitted. */
  contentType?: string;
}

/** A message with its own body. */
export interface SendEmailWithHtml extends SendEmailBase {
  subject: string;
  html: string;
  react?: never;
  templateId?: never;
  template?: never;
}

/**
 * A message whose body is a React Email component, rendered locally to
 * `html` (and `text`, unless you give one). Needs `@react-email/render`.
 */
export interface SendEmailWithReact extends SendEmailBase {
  subject: string;
  /** e.g. `<WelcomeEmail name="Ada" />`. */
  react: unknown;
  html?: never;
  templateId?: never;
  template?: never;
}

/** A message rendered from a published template. */
export interface SendEmailWithTemplate extends SendEmailBase {
  /** A published template's public id (`tpl_…`) or uuid. */
  templateId?: string;
  /** A published template's send name (its `key`, e.g. `"welcome"`). Use this or `templateId`. */
  template?: string;
  /** Overrides the template's subject. */
  subject?: string;
  html?: never;
  react?: never;
}

export type SendEmailParams = SendEmailWithHtml | SendEmailWithReact | SendEmailWithTemplate;

export type EmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface SentEmail {
  /** SendClipper's id for the message. Use it with `emails.get()`. */
  id: string;
  messageId: string;
  sesMessageId: string | null;
  from: string;
  to: string;
  domain: string;
  subject: string;
  status: EmailStatus;
  createdAt: string;
  templateId: string | null;
}

export type BatchResult =
  | { index: number; status: 'accepted'; id: string; messageId: string }
  | { index: number; status: 'failed'; error: { code: string; message: string; detail?: unknown } };

export interface SendBatchResponse {
  /** One entry per submitted item, in order. A failed item costs its siblings nothing. */
  data: BatchResult[];
  summary: { submitted: number; accepted: number; failed: number };
}

export interface ListEmailsParams {
  search?: string;
  status?: EmailStatus;
  /** Exact sending domain. */
  domain?: string;
  broadcastId?: string;
  /** ISO 8601 lower bound. */
  from?: string;
  /** ISO 8601 upper bound. */
  to?: string;
  page?: number;
  /** 1–100, default 50. */
  pageSize?: number;
}

export interface EmailRow {
  id: string;
  messageId: string;
  from: string;
  to: string;
  domain: string;
  subject: string;
  status: EmailStatus;
  sesMessageId: string | null;
  createdAt: string;
}

export interface EmailList extends NumberedPage<EmailRow> {
  /** A search counts only its newest 1,000 matches. */
  totalCapped: boolean;
}

export interface EmailEvent {
  id: string;
  type: string;
  meta: unknown;
  createdAt: string;
}

export interface EmailDetail extends EmailRow {
  html: string | null;
  text: string | null;
  /** `true` once the retention window deleted the body. */
  bodyExpired: boolean;
  events: EmailEvent[];
  threadId?: string | null;
  sendClass?: SendClass;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface EmailStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  bodyRetentionDays: number;
}

/* ----------------------------------------------------------------- domains */

export interface DnsRecord {
  type: string;
  purpose: string;
  host: string;
  value: string;
  copyValue?: string;
  priority?: number;
  status?: string;
}

export interface Domain {
  id: string;
  name: string;
  region: DomainRegion;
  status: 'verified' | 'pending' | 'failed';
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  records: Array<{ name: 'SPF' | 'DKIM' | 'DMARC'; ok: boolean }>;
  sent: number;
  checkCount: number;
  lastCheckedAt: string | null;
  createdAt: string;
  lastError: string | null;
  receivingEnabled: boolean;
  mxOk: boolean;
  receivingVerified: boolean;
  receivingError: string | null;
}

export interface DomainRecords {
  domain: Domain;
  records: DnsRecord[];
}

export interface CreateDomainParams {
  /** A hostname such as `send.acme.com`. No scheme, no trailing slash. */
  name: string;
  /** Where Amazon SES registers it. Cannot change once the domain holds messages. */
  region: DomainRegion;
}

/* --------------------------------------------------------------- templates */

export type TemplateBlock = Record<string, unknown> & { type: string; id?: string };

export interface TemplateTag {
  id: string;
  name: string;
  color: TagColor;
}

export type TagColor = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

export interface TemplateSummary {
  id: string;
  publicId: string;
  name: string;
  status: 'draft' | 'published';
  blockCount: number;
  updatedAt: string;
  publishedAt: string | null;
  createdAt: string;
  domains: Array<{ id: string; name: string }>;
  tags: TemplateTag[];
  key: string | null;
  project: { id: string; name: string } | null;
}

export interface Template extends TemplateSummary {
  subject: string;
  preheader: string;
  blocks: TemplateBlock[];
  html: string;
}

export interface CreateTemplateParams {
  name?: string;
  subject?: string;
  preheader?: string;
  /** See https://sendclipper.com/docs for the block types. Unknown fields are dropped. */
  blocks?: TemplateBlock[];
  /** The domain whose project the template belongs to. */
  projectDomainId?: string;
  /** Send name, unique in its project: `emails.send({ template: key })`. */
  key?: string;
}

export interface UpdateTemplateParams {
  name?: string;
  subject?: string;
  preheader?: string;
  blocks?: TemplateBlock[];
  domainIds?: string[];
  projectDomainId?: string | null;
  key?: string | null;
}

export interface ListTemplatesParams {
  /** A tag id. */
  tag?: string;
  /** A project (domain) id. */
  project?: string;
}

export interface TemplatePreview {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  variables: Array<{ name: string; fallback: string | null; value: string; provided: boolean }>;
  /** Links whose target a tag would make unsafe. */
  unsafeLinks: string[];
}

export interface TemplateAsset {
  id: string;
  publicId: string;
  /** Public URL a mail client can load. */
  url: string;
  mimeType: string;
  bytes: number;
  name: string;
  createdAt: string;
}

export interface UploadTemplateAssetParams {
  /** `image/png`, `image/jpeg`, `image/gif` or `image/webp`. */
  mimeType: string;
  /** The file's bytes; a Buffer/Uint8Array is base64-encoded for you. */
  data: Uint8Array | string;
  name?: string;
}

/* --------------------------------------------------------------- sandboxes */

export interface Sandbox {
  id: string;
  name: string;
  slug: string;
  /** Mail sent to this address lands in the sandbox. */
  inboxAddress: string;
  inboundLive: boolean;
  projectLabel: string;
  color: string;
  total: number;
  unread: number;
  messageCap: number;
  retentionDays: number;
  lastTrappedAt: string | null;
  createdAt: string;
}

export interface CreateSandboxParams {
  name: string;
  projectLabel?: string;
  /** `#rrggbb`. */
  color?: string;
}

export type UpdateSandboxParams = Partial<CreateSandboxParams>;

export interface SandboxCredentials {
  host: string;
  port: number;
  tls: 'required' | 'optional' | 'none';
  maxRecipients: number;
  username: string;
  password: string;
  maxMessageBytes: number;
  retentionDays: number;
  apiEndpoint: string;
  inboxId: string;
  inboxAddress: string;
  inboundDomain: string;
  inboundLive: boolean;
  /** The JSON token is hashed; only its hint can be read back. */
  apiTokenHint: string;
}

export interface ResetSandboxCredentials {
  username: string;
  password: string;
  /** The `sc_sbx_…` token. Shown once. */
  apiToken: string;
}

export interface SandboxMessageSummary {
  id: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  snippet: string;
  sizeBytes: number;
  read: boolean;
  trappedAt: string;
}

export interface SandboxMessage extends SandboxMessageSummary {
  ccAddresses: string[];
  /** SMTP envelope, recorded apart from the headers (a Bcc recipient is only here). */
  envelopeFrom: string;
  envelopeTo: string[];
  bodyHtml: string | null;
  /** `null` when the message carried no text/plain part. */
  bodyText: string | null;
  headers: Array<{ name: string; value: string }>;
  transport: string;
  clientIp: string | null;
  hasRaw: boolean;
}

export interface ListSandboxMessagesParams {
  search?: string;
  limit?: number;
}

/* ---------------------------------------------------------------- webhooks */

export type WebhookEventType =
  | 'email.delivered'
  | 'email.opened'
  | 'email.clicked'
  | 'email.bounced'
  | 'email.complained'
  | 'email.failed';

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  createdAt: string;
  secretMasked: string;
  secretRotatedAt: string | null;
  previousSecretExpiresAt: string | null;
  successRate: number | null;
  successRateWindowDays: number;
  deliveryCount: number;
  deliveredCount: number;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  /** The full `whsec_…` signing secret. Returned once; store it now. */
  secret: string;
}

export interface CreateWebhookParams {
  url: string;
  events: WebhookEventType[];
  /** Accept a plain `http://` URL. Off by default. */
  allowInsecureHttp?: boolean;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEventType[];
  active?: boolean;
  allowInsecureHttp?: boolean;
}

export type WebhookDispatchState = 'pending' | 'delivering' | 'delivered' | 'dead_lettered';

export interface ListWebhookDispatchesParams {
  /** Default `dead_lettered`. `retrying` = pending or delivering. */
  state?: WebhookDispatchState | 'retrying' | 'all';
  endpointId?: string;
  cursor?: string;
  /** 1–100. */
  limit?: number;
}

export interface WebhookDispatch {
  id: string;
  endpointId: string;
  endpointUrl: string;
  /** The `id` the receiver saw in the body. */
  eventId: string;
  event: WebhookEventType;
  state: WebhookDispatchState;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  lastAttemptError: string | null;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  replayedAt: string | null;
  replayCount: number;
}

export interface ReplayAllParams {
  state?: 'dead_lettered';
  endpointId?: string;
}

export interface ReplayAllResult {
  queued: number;
  remaining: number;
  capped: boolean;
  max: number;
}

/** What a webhook delivery's body is. */
export interface WebhookEvent {
  /** Stable for one (email, event): deduplicate on it. */
  id: string;
  event: WebhookEventType;
  createdAt: string;
  data: {
    emailId: string;
    messageId: string;
    to: string;
    domain: string;
    subject: string;
    [field: string]: unknown;
  };
}

/* ------------------------------------------------------ contacts & audience */

export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced';

export interface Contact {
  id: string;
  name: string;
  email: string;
  status: ContactStatus;
  audienceId: string | null;
  audienceName: string | null;
  audienceColor: string | null;
  createdAt: string;
}

export interface ContactList extends NumberedPage<Contact> {
  totalPages: number;
  totalAll: number;
}

export interface CreateContactParams {
  name: string;
  email: string;
  audienceId?: string;
  status?: ContactStatus;
}

export interface ListContactsParams {
  audienceId?: string;
  status?: ContactStatus;
  page?: number;
  /** 1–200, default 25. */
  pageSize?: number;
}

export interface Audience {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface ImportContactsParams {
  /** CSV or vCard bytes/text. */
  file: Uint8Array | string;
  /** `contacts.csv` / `contacts.vcf`; the extension decides the parser. */
  filename?: string;
  audienceId?: string;
  newAudience?: string;
  createAudiences?: boolean;
  onDuplicate?: 'skip' | 'update';
  /** Column mapping as the dashboard's import preview returns it. */
  mapping?: Record<string, unknown>;
}

/* ------------------------------------------------------------ suppressions */

export type SuppressionReason =
  | 'hard_bounce'
  | 'soft_bounce'
  | 'complaint'
  | 'unsubscribe'
  | 'manual'
  | 'provider';

export interface Suppression {
  id: string;
  email: string;
  reason: SuppressionReason;
  reasonLabel: string;
  reasonDetail: string | null;
  diagnosticCode: string | null;
  /** `marketing` for an unsubscribe, `all` for everything else. */
  scope: 'all' | 'marketing';
  sourceEmailId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
}

export interface SuppressionList extends CursorPage<Suppression> {
  counts: { total: number; byReason: Record<SuppressionReason, number> };
}

export interface ListSuppressionsParams {
  /** Address search. */
  q?: string;
  reason?: SuppressionReason;
  cursor?: string;
  /** 1–100. */
  limit?: number;
}

/* --------------------------------------------------------------- mailboxes */

export type MailFolder = 'all' | 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash';

export interface Mailbox {
  id: string;
  address: string;
  displayName: string;
  domain: string;
  domainId: string;
  catchAll: boolean;
  archived: boolean;
  canReceive: boolean;
  canSend: boolean;
  unread: number;
  total: number;
}

export interface CreateMailboxParams {
  domainId: string;
  localPart: string;
  displayName?: string;
  color?: string;
  catchAll?: boolean;
}

export interface UpdateMailboxParams {
  localPart?: string;
  displayName?: string;
  color?: string;
  catchAll?: boolean;
  archived?: boolean;
  notifyOwner?: boolean;
  embedOrigins?: string[];
}

export interface ListMailboxMessagesParams {
  folder?: MailFolder;
  search?: string;
  label?: string;
  /** 1–200. */
  limit?: number;
  cursor?: string;
}

export interface MailboxMessageRow {
  id: string;
  folder: string;
  from: string;
  fromName: string;
  to: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  snippet: string;
  label: string | null;
  unread: boolean;
  starred: boolean;
  receivedAt: string;
  mailboxId: string | null;
  threadId: string | null;
}

export interface MailboxMessageList {
  items: MailboxMessageRow[];
  total: number;
  unread: number;
  totalCapped: boolean;
  page: { cursor: string | null; hasMore: boolean };
}

export interface MailboxThreadMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  fromName: string;
  to: string;
  cc: string[] | null;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  bodyExpiredAt: string | null;
  occurredAt: string;
  folder: string | null;
  status: string | null;
  unread: boolean;
}

export interface MailboxMessage extends MailboxMessageRow {
  bodyText: string | null;
  bodyHtml: string | null;
  bodyExpiredAt: string | null;
  thread: {
    id: string;
    subject: string;
    messageCount: number;
    lastAt: string;
    participants: string[];
    messages: MailboxThreadMessage[];
  } | null;
  /** Download one with `mailboxes.messages.attachment()`. */
  attachments: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }>;
  /** SPF/DKIM/DMARC/spam verdicts for received mail; `null` for your own sends. */
  authentication: Record<string, unknown> | null;
}

/* --------------------------------------------------------------- workspace */

export interface Workspace {
  id: string;
  name: string;
  publicId: string;
  createdAt: string;
  sendingPaused: { at: string; reason: string; message: string } | null;
  postalAddress: string | null;
  [field: string]: unknown;
}

export interface ApiKey {
  id: string;
  name: string;
  masked: string;
  prefix: string;
  last4: string;
  permission: 'full' | 'sending' | 'read';
  domainId: string | null;
  domain: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}
