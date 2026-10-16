import { HttpClient, type ClientOptions } from './core.js';
import { Audiences, Contacts, Suppressions } from './resources/audience.js';
import { Domains } from './resources/domains.js';
import { Batch, Emails } from './resources/emails.js';
import { Mailboxes } from './resources/mailboxes.js';
import { Sandboxes } from './resources/sandboxes.js';
import { Templates } from './resources/templates.js';
import { Webhooks } from './resources/webhooks.js';
import { ApiKeys, Automations, WorkspaceResource } from './resources/workspace.js';

/**
 * The SendClipper API client.
 *
 * ```ts
 * import { SendClipper } from '@sendclipper/node';
 *
 * const sc = new SendClipper(process.env.SENDCLIPPER_API_KEY);
 * const { data, error } = await sc.emails.send({
 *   from: 'hello@acme.io',
 *   to: 'ada@lumen.io',
 *   subject: 'Hi',
 *   html: '<p>Hi</p>',
 * });
 * ```
 */
export class SendClipper {
  readonly emails: Emails;
  readonly batch: Batch;
  readonly domains: Domains;
  readonly templates: Templates;
  readonly sandboxes: Sandboxes;
  readonly webhooks: Webhooks;
  readonly contacts: Contacts;
  readonly audiences: Audiences;
  readonly suppressions: Suppressions;
  readonly mailboxes: Mailboxes;
  readonly automations: Automations;
  readonly workspace: WorkspaceResource;
  readonly apiKeys: ApiKeys;

  /** The API origin requests go to, without `/v1`. */
  readonly baseUrl: string;

  constructor(apiKey?: string, options?: Omit<ClientOptions, 'apiKey'>);
  constructor(options?: ClientOptions);
  constructor(keyOrOptions?: string | ClientOptions, options: Omit<ClientOptions, 'apiKey'> = {}) {
    const opts: ClientOptions =
      typeof keyOrOptions === 'string' ? { ...options, apiKey: keyOrOptions } : { ...(keyOrOptions ?? {}) };
    const http = new HttpClient(opts);
    this.baseUrl = http.baseUrl;
    this.emails = new Emails(http);
    this.batch = new Batch(http);
    this.domains = new Domains(http);
    this.templates = new Templates(http);
    this.sandboxes = new Sandboxes(http);
    this.webhooks = new Webhooks(http);
    this.contacts = new Contacts(http);
    this.audiences = new Audiences(http);
    this.suppressions = new Suppressions(http);
    this.mailboxes = new Mailboxes(http);
    this.automations = new Automations(http);
    this.workspace = new WorkspaceResource(http);
    this.apiKeys = new ApiKeys(http);
  }
}

export default SendClipper;

export { DEFAULT_BASE_URL } from './core.js';
export type { ClientOptions, RequestOptions, DownloadedFile, Query, Result, ErrorResponse } from './core.js';
export {
  SendClipperError,
  SendClipperApiError,
  SendClipperConnectionError,
  WebhookVerificationError,
} from './errors.js';
export {
  verifyWebhook,
  signatureHeader,
  signPayload,
  parseSignatureHeader,
  WEBHOOK_TOLERANCE_SECONDS,
} from './webhook-signature.js';
export type { VerifyWebhookParams, HeaderSource } from './webhook-signature.js';
export { VERSION } from './version.js';
export type * from './types.js';
