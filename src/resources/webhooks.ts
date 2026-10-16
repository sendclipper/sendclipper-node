import type { HttpClient, RequestOptions, Result } from '../core.js';
import { seg, unwrap } from '../core.js';
import type {
  CreateWebhookParams,
  CursorPage,
  ListWebhookDispatchesParams,
  ReplayAllParams,
  ReplayAllResult,
  UpdateWebhookParams,
  WebhookDispatch,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  WebhookEvent,
} from '../types.js';
import { verifyWebhook, type VerifyWebhookParams } from '../webhook-signature.js';

export class WebhookDispatches {
  constructor(private readonly http: HttpClient) {}

  /** Undelivered events: dead letters by default, or `state: 'retrying'`. */
  list(params: ListWebhookDispatchesParams = {}, options: RequestOptions = {}): Promise<Result<CursorPage<WebhookDispatch>>> {
    return this.http.call({ method: 'GET', path: '/webhook-dispatches', query: { ...params }, ...options });
  }

  async *iterate(params: Omit<ListWebhookDispatchesParams, 'cursor'> = {}, options: RequestOptions = {}): AsyncGenerator<WebhookDispatch> {
    let cursor: string | undefined;
    for (;;) {
      const res = unwrap(await this.list({ ...params, cursor }, options));
      yield* res.data;
      if (!res.page.hasMore || !res.page.cursor) return;
      cursor = res.page.cursor;
    }
  }

  get(id: string, options: RequestOptions = {}): Promise<Result<WebhookDispatch>> {
    return this.http.call({ method: 'GET', path: `/webhook-dispatches/${seg(id)}`, ...options });
  }

  /** One more immediate attempt for a dead-lettered event. */
  replay(id: string, options: RequestOptions = {}): Promise<Result<WebhookDispatch>> {
    return this.http.call({ method: 'POST', path: `/webhook-dispatches/${seg(id)}/replay`, ...options });
  }

  /** Replay every dead letter (optionally of one endpoint), up to the server's cap. */
  replayAll(params: ReplayAllParams = {}, options: RequestOptions = {}): Promise<Result<ReplayAllResult>> {
    return this.http.call({ method: 'POST', path: '/webhook-dispatches/replay-all', body: params, ...options });
  }
}

export class Webhooks {
  readonly dispatches: WebhookDispatches;

  constructor(private readonly http: HttpClient) {
    this.dispatches = new WebhookDispatches(http);
  }

  list(options: RequestOptions = {}): Promise<Result<WebhookEndpoint[]>> {
    return this.http.call({ method: 'GET', path: '/webhook-endpoints', ...options });
  }

  /** The response carries the signing `secret` once. Store it. */
  create(params: CreateWebhookParams, options: RequestOptions = {}): Promise<Result<WebhookEndpointWithSecret>> {
    return this.http.call({ method: 'POST', path: '/webhook-endpoints', body: params, ...options });
  }

  update(id: string, params: UpdateWebhookParams, options: RequestOptions = {}): Promise<Result<WebhookEndpoint>> {
    return this.http.call({ method: 'PATCH', path: `/webhook-endpoints/${seg(id)}`, body: params, ...options });
  }

  remove(id: string, options: RequestOptions = {}): Promise<Result<void>> {
    return this.http.call({ method: 'DELETE', path: `/webhook-endpoints/${seg(id)}`, ...options });
  }

  /** A new secret. The old one keeps signing alongside it for the grace window. */
  rotateSecret(id: string, options: RequestOptions = {}): Promise<Result<WebhookEndpointWithSecret>> {
    return this.http.call({ method: 'POST', path: `/webhook-endpoints/${seg(id)}/rotate-secret`, ...options });
  }

  /** Recent delivery attempts. */
  deliveries(
    params: { endpointId?: string; finalOnly?: boolean; limit?: number } = {},
    options: RequestOptions = {},
  ): Promise<Result<Array<Record<string, unknown>>>> {
    return this.http.call({ method: 'GET', path: '/webhook-deliveries', query: { ...params }, ...options });
  }

  /**
   * Verify a delivery's signature and return the parsed event. Makes no request.
   * @throws WebhookVerificationError
   */
  verify(params: VerifyWebhookParams): WebhookEvent {
    return verifyWebhook(params);
  }
}
