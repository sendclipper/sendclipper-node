import type { DownloadedFile, HttpClient, RequestOptions, Result } from '../core.js';
import { seg, unwrap } from '../core.js';
import type {
  CreateMailboxParams,
  ListMailboxMessagesParams,
  Mailbox,
  MailboxMessage,
  MailboxMessageList,
  MailboxMessageRow,
  UpdateMailboxParams,
} from '../types.js';

export class MailboxMessages {
  constructor(private readonly http: HttpClient) {}

  /** Mail filed under one address. Reading never marks anything read. */
  list(mailboxId: string, params: ListMailboxMessagesParams = {}, options: RequestOptions = {}): Promise<Result<MailboxMessageList>> {
    return this.http.call({ method: 'GET', path: `/mailboxes/${seg(mailboxId)}/messages`, query: { ...params }, ...options });
  }

  async *iterate(
    mailboxId: string,
    params: Omit<ListMailboxMessagesParams, 'cursor'> = {},
    options: RequestOptions = {},
  ): AsyncGenerator<MailboxMessageRow> {
    let cursor: string | undefined;
    for (;;) {
      const res = unwrap(await this.list(mailboxId, { ...params, cursor }, options));
      yield* res.items;
      if (!res.page.hasMore || !res.page.cursor) return;
      cursor = res.page.cursor;
    }
  }

  get(mailboxId: string, messageId: string, options: RequestOptions = {}): Promise<Result<MailboxMessage>> {
    return this.http.call({ method: 'GET', path: `/mailboxes/${seg(mailboxId)}/messages/${seg(messageId)}`, ...options });
  }

  /** Download one attachment's bytes. */
  attachment(mailboxId: string, messageId: string, attachmentId: string, options: RequestOptions = {}): Promise<Result<DownloadedFile>> {
    return this.http.call({
      method: 'GET',
      path: `/mailboxes/${seg(mailboxId)}/messages/${seg(messageId)}/parts/${seg(attachmentId)}`,
      query: { download: 1 },
      as: 'bytes',
      ...options,
    });
  }
}

export class Mailboxes {
  readonly messages: MailboxMessages;

  constructor(private readonly http: HttpClient) {
    this.messages = new MailboxMessages(http);
  }

  list(params: { includeArchived?: boolean } = {}, options: RequestOptions = {}): Promise<Result<Mailbox[]>> {
    return this.http.call({ method: 'GET', path: '/mailboxes', query: { ...params }, ...options });
  }

  get(id: string, options: RequestOptions = {}): Promise<Result<Mailbox>> {
    return this.http.call({ method: 'GET', path: `/mailboxes/${seg(id)}`, ...options });
  }

  /** A new address on a receiving domain. */
  create(params: CreateMailboxParams, options: RequestOptions = {}): Promise<Result<Mailbox>> {
    return this.http.call({ method: 'POST', path: '/mailboxes', body: params, ...options });
  }

  update(id: string, params: UpdateMailboxParams, options: RequestOptions = {}): Promise<Result<Mailbox>> {
    return this.http.call({ method: 'PATCH', path: `/mailboxes/${seg(id)}`, body: params, ...options });
  }

  /** Archives the address. Its mail is kept. */
  archive(id: string, options: RequestOptions = {}): Promise<Result<Mailbox>> {
    return this.http.call({ method: 'DELETE', path: `/mailboxes/${seg(id)}`, ...options });
  }
}
