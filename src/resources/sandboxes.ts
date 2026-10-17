import { withEncodedAttachments } from '../attachments.js';
import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg } from '../core.js';
import type {
  CreateSandboxParams,
  ListSandboxMessagesParams,
  ResetSandboxCredentials,
  Sandbox,
  SandboxCredentials,
  SandboxMessage,
  SandboxMessageSummary,
  SendEmailParams,
  UpdateSandboxParams,
} from '../types.js';

export class SandboxMessages {
  constructor(private readonly http: HttpClient) {}

  list(sandboxId: string, params: ListSandboxMessagesParams = {}, options: RequestOptions = {}): Promise<Result<SandboxMessageSummary[]>> {
    return this.http.call({ method: 'GET', path: `/sandboxes/${seg(sandboxId)}/messages`, query: { ...params }, ...options });
  }

  get(sandboxId: string, messageId: string, options: RequestOptions = {}): Promise<Result<SandboxMessage>> {
    return this.http.call({ method: 'GET', path: `/sandboxes/${seg(sandboxId)}/messages/${seg(messageId)}`, ...options });
  }

  /** The message's raw MIME source. */
  raw(sandboxId: string, messageId: string, options: RequestOptions = {}): Promise<Result<string>> {
    return this.http.call({
      method: 'GET',
      path: `/sandboxes/${seg(sandboxId)}/messages/${seg(messageId)}/raw`,
      as: 'text',
      ...options,
    });
  }

  remove(sandboxId: string, messageId: string, options: RequestOptions = {}): Promise<Result<void>> {
    return this.http.call({ method: 'DELETE', path: `/sandboxes/${seg(sandboxId)}/messages/${seg(messageId)}`, ...options });
  }

  /** Empty the sandbox. */
  clear(sandboxId: string, options: RequestOptions = {}): Promise<Result<{ deleted: number }>> {
    return this.http.call({ method: 'DELETE', path: `/sandboxes/${seg(sandboxId)}/messages`, ...options });
  }

  markAllRead(sandboxId: string, options: RequestOptions = {}): Promise<Result<{ updated: number }>> {
    return this.http.call({ method: 'POST', path: `/sandboxes/${seg(sandboxId)}/read-all`, ...options });
  }

  /**
   * Poll until a message arrives that `match` accepts (default: any message
   * trapped after this call started). Handy in end-to-end tests.
   */
  async waitFor(
    sandboxId: string,
    opts: { match?: (m: SandboxMessageSummary) => boolean; timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<Result<SandboxMessage>> {
    const started = Date.now();
    const deadline = started + (opts.timeoutMs ?? 30_000);
    const match = opts.match ?? ((m: SandboxMessageSummary) => Date.parse(m.trappedAt) >= started - 1000);
    for (;;) {
      const page = await this.list(sandboxId, { limit: 50 });
      if (page.error) return page;
      const found = page.data.find(match);
      if (found) return this.get(sandboxId, found.id);
      if (Date.now() >= deadline) {
        return {
          data: null,
          error: {
            name: 'timeout',
            message: `No matching message reached sandbox ${sandboxId} within ${opts.timeoutMs ?? 30_000} ms.`,
            statusCode: null,
          },
          headers: null,
        };
      }
      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1000));
    }
  }
}

export class Sandboxes {
  readonly messages: SandboxMessages;

  constructor(private readonly http: HttpClient) {
    this.messages = new SandboxMessages(http);
  }

  list(options: RequestOptions = {}): Promise<Result<Sandbox[]>> {
    return this.http.call({ method: 'GET', path: '/sandboxes', ...options });
  }

  get(id: string, options: RequestOptions = {}): Promise<Result<Sandbox>> {
    return this.http.call({ method: 'GET', path: `/sandboxes/${seg(id)}`, ...options });
  }

  create(params: CreateSandboxParams, options: RequestOptions = {}): Promise<Result<Sandbox>> {
    return this.http.call({ method: 'POST', path: '/sandboxes', body: params, ...options });
  }

  /** Renaming never changes the address or the credentials. */
  update(id: string, params: UpdateSandboxParams, options: RequestOptions = {}): Promise<Result<Sandbox>> {
    return this.http.call({ method: 'PATCH', path: `/sandboxes/${seg(id)}`, body: params, ...options });
  }

  /** Deletes the sandbox and every message in it. */
  remove(id: string, options: RequestOptions = {}): Promise<Result<{ deletedMessages: number }>> {
    return this.http.call({ method: 'DELETE', path: `/sandboxes/${seg(id)}`, ...options });
  }

  /** SMTP host, port, username and password to point a project at. */
  credentials(id: string, options: RequestOptions = {}): Promise<Result<SandboxCredentials>> {
    return this.http.call({ method: 'GET', path: `/sandboxes/${seg(id)}/credentials`, ...options });
  }

  /** Replace BOTH the SMTP password and the `sc_sbx_` token. The token is shown only here. */
  resetCredentials(id: string, options: RequestOptions = {}): Promise<Result<ResetSandboxCredentials>> {
    return this.http.call({ method: 'POST', path: `/sandboxes/${seg(id)}/credentials`, ...options });
  }

  /**
   * Send to a sandbox through its JSON door, with the sandbox's own
   * `sc_sbx_…` token. Same fields as `emails.send()`; nothing is delivered.
   */
  send(
    sandboxToken: string,
    params: SendEmailParams,
    options: RequestOptions = {},
  ): Promise<Result<{ id: string; duplicate?: boolean }>> {
    return this.http.call({ method: 'POST', path: '/sandbox/emails', body: withEncodedAttachments(params), bearer: sandboxToken, ...options });
  }
}
