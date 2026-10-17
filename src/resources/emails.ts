import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg, unwrap } from '../core.js';
import { withRenderedReact } from '../render.js';
import { withEncodedAttachments } from '../attachments.js';
import type {
  EmailDetail,
  EmailList,
  EmailRow,
  EmailStats,
  ListEmailsParams,
  SendBatchResponse,
  SendEmailParams,
  SentEmail,
} from '../types.js';

export class Emails {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send one message. Resolves once SendClipper accepted it (status `queued`);
   * delivery is reported later through `emails.get()` and webhooks.
   *
   * Every call carries an `Idempotency-Key`, so the SDK's own retries never
   * send twice. Pass `idempotencyKey` yourself to make YOUR retries safe too.
   */
  async send(params: SendEmailParams, options: RequestOptions = {}): Promise<Result<SentEmail>> {
    return this.http.call({ method: 'POST', path: '/emails', body: withEncodedAttachments(await withRenderedReact(params)), ...options });
  }

  /** Same as `batch.send()`. */
  sendBatch(emails: SendEmailParams[], options: RequestOptions = {}): Promise<Result<SendBatchResponse>> {
    return sendBatch(this.http, emails, options);
  }

  /** One message with its body and event timeline. */
  get(id: string, options: RequestOptions = {}): Promise<Result<EmailDetail>> {
    return this.http.call({ method: 'GET', path: `/emails/${seg(id)}`, ...options });
  }

  /** One page of the sent-mail log, newest first. */
  list(params: ListEmailsParams = {}, options: RequestOptions = {}): Promise<Result<EmailList>> {
    return this.http.call({ method: 'GET', path: '/emails', query: { ...params }, ...options });
  }

  /** Every message matching `params`, page after page. */
  async *iterate(params: Omit<ListEmailsParams, 'page'> = {}, options: RequestOptions = {}): AsyncGenerator<EmailRow> {
    const pageSize = params.pageSize ?? 100;
    for (let page = 1; ; page++) {
      const res = unwrap(await this.list({ ...params, page, pageSize }, options));
      yield* res.items;
      if (res.items.length < pageSize || page * pageSize >= res.total) return;
    }
  }

  /** Counts per status. */
  stats(options: RequestOptions = {}): Promise<Result<EmailStats>> {
    return this.http.call({ method: 'GET', path: '/emails/stats/summary', ...options });
  }
}

export class Batch {
  constructor(private readonly http: HttpClient) {}

  /**
   * Up to 500 messages in one request (one recipient each). Every item is
   * accepted or refused on its own; a refused item costs its siblings nothing.
   */
  send(emails: SendEmailParams[], options: RequestOptions = {}): Promise<Result<SendBatchResponse>> {
    return sendBatch(this.http, emails, options);
  }
}

async function sendBatch(
  http: HttpClient,
  emails: SendEmailParams[],
  options: RequestOptions,
): Promise<Result<SendBatchResponse>> {
  const rendered = await Promise.all(emails.map(async (e) => withEncodedAttachments(await withRenderedReact(e))));
  return http.call({ method: 'POST', path: '/emails/batch', body: { emails: rendered }, ...options });
}
