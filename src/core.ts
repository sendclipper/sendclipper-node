import { randomUUID } from 'node:crypto';
import { SendClipperApiError, SendClipperConnectionError, toApiError } from './errors.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://sendclipper.com';

export interface ClientOptions {
  /** Defaults to `process.env.SENDCLIPPER_API_KEY`. A `sc_live_…` key. */
  apiKey?: string;
  /** Defaults to `process.env.SENDCLIPPER_BASE_URL`, then `https://sendclipper.com`. No `/v1`. */
  baseUrl?: string;
  /** Per attempt, in milliseconds. Default 30 000. */
  timeoutMs?: number;
  /**
   * Retries after a network error, a 429 or a 5xx. Default 2. A mutation is
   * only retried when it carries an `Idempotency-Key`, which the SDK adds to
   * every JSON mutation, so a retried send can never go out twice.
   */
  maxRetries?: number;
  /** Your own `fetch` (a proxy agent, a test double). Defaults to the global one. */
  fetch?: typeof fetch;
  /** Sent on every request. */
  defaultHeaders?: Record<string, string>;
}

/** What an API refusal or a network failure looks like. */
export interface ErrorResponse {
  /** SendClipper's machine-readable code: `domain_not_verified`, `validation_failed`, `rate_limited`, `network_error`, … */
  name: string;
  /** A sentence meant for a person. */
  message: string;
  /** The HTTP status, or `null` when no answer arrived (network, timeout, abort). */
  statusCode: number | null;
  /** Extra, code-specific facts (e.g. the missing template tags). */
  detail?: unknown;
}

/** Every API method resolves to this. Exactly one of `data` and `error` is set. */
export type Result<T> = (
  | { data: T; error: null }
  | { data: null; error: ErrorResponse }
) & {
  headers: Record<string, string> | null;
};

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  /** Your own key, reused when YOU retry the same logical call later. */
  idempotencyKey?: string;
  /** Override the client's timeout for this call. */
  timeoutMs?: number;
  /** Override the client's retry count for this call. */
  maxRetries?: number;
  /** Abort the call from outside. */
  signal?: AbortSignal;
  /** Extra headers for this call. */
  headers?: Record<string, string>;
}

/** What a download resolves to. */
export interface DownloadedFile {
  bytes: Uint8Array;
  contentType: string | null;
  filename: string | null;
}

interface InternalRequest extends RequestOptions {
  method: string;
  path: string;
  query?: Query;
  body?: unknown;
  form?: FormData;
  as?: 'json' | 'text' | 'bytes';
  /** Replaces the API key (the sandbox JSON door takes an `sc_sbx_` token). */
  bearer?: string;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 60_000;

export class HttpClient {
  readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: ClientOptions = {}) {
    const env = typeof process !== 'undefined' ? process.env : {};
    this.apiKey = opts.apiKey ?? env.SENDCLIPPER_API_KEY;
    this.baseUrl = (opts.baseUrl ?? env.SENDCLIPPER_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, opts.maxRetries ?? 2);
    const f = opts.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new Error('@sendclipper/node needs a global fetch (Node.js 18 or newer) or a `fetch` option.');
    }
    this.fetchImpl = f;
    this.defaultHeaders = opts.defaultHeaders ?? {};
  }

  /**
   * The public face of every API method: never throws for an API refusal or
   * a network failure, it answers `{ data, error, headers }`.
   */
  async call<T>(req: InternalRequest): Promise<Result<T>> {
    try {
      const { data, headers } = await this.request<T>(req);
      return { data, error: null, headers };
    } catch (err) {
      if (err instanceof SendClipperApiError) {
        return { data: null, error: errorResponseOf(err), headers: err.headers ? headersOf(err.headers) : null };
      }
      if (err instanceof SendClipperConnectionError) {
        return { data: null, error: { name: 'network_error', message: err.message, statusCode: null }, headers: null };
      }
      if (req.signal?.aborted) {
        return {
          data: null,
          error: { name: 'network_error', message: 'The request was aborted.', statusCode: null },
          headers: null,
        };
      }
      throw err;
    }
  }

  /** Like `call()`, but throws `SendClipperApiError` / `SendClipperConnectionError`. */
  async request<T>(req: InternalRequest): Promise<{ data: T; headers: Record<string, string> }> {
    const bearer = req.bearer ?? this.apiKey;
    if (!bearer) {
      throw new SendClipperApiError(
        401,
        'api_key_missing',
        'No SendClipper API key. Pass one to `new SendClipper("sc_live_…")` or set SENDCLIPPER_API_KEY.',
      );
    }

    const url = new URL(`${this.baseUrl}/v1${req.path.startsWith('/') ? req.path : `/${req.path}`}`);
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearer}`,
      Accept: req.as === 'json' || !req.as ? 'application/json' : '*/*',
      'User-Agent': `sendclipper-node/${VERSION}`,
      ...this.defaultHeaders,
      ...(req.headers ?? {}),
    };

    let body: BodyInit | undefined;
    if (req.form) {
      body = req.form;
    } else if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }

    const isRead = req.method === 'GET' || req.method === 'HEAD';
    // The API de-duplicates every JSON mutation on this header for 24 hours.
    // A multipart body is not fingerprinted server-side, so it gets no key and
    // is never retried.
    if (!isRead && !req.form) {
      headers['Idempotency-Key'] = req.idempotencyKey ?? `sc-node-${randomUUID()}`;
    } else if (req.idempotencyKey) {
      headers['Idempotency-Key'] = req.idempotencyKey;
    }
    const canRetry = isRead || Boolean(headers['Idempotency-Key']);
    const maxRetries = canRetry ? Math.max(0, req.maxRetries ?? this.maxRetries) : 0;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchOnce(url, req.method, headers, body, req.timeoutMs ?? this.timeoutMs, req.signal);
      } catch (err) {
        if (req.signal?.aborted) throw err;
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      }

      if (!res.ok && RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(retryAfterMs(res.headers) ?? backoffMs(attempt));
        continue;
      }

      if (!res.ok) {
        const err = toApiError(res.status, await res.text(), res.headers);
        // Our own earlier attempt is still running server-side (a timeout
        // that was not a failure). Its result is replayed once it finishes.
        if (err.code === 'idempotency_key_in_flight' && attempt < maxRetries) {
          await sleep(retryAfterMs(res.headers) ?? backoffMs(attempt));
          continue;
        }
        throw err;
      }

      const responseHeaders = headersOf(res.headers);
      if (req.as === 'bytes') {
        const file: DownloadedFile = {
          bytes: new Uint8Array(await res.arrayBuffer()),
          contentType: res.headers.get('content-type'),
          filename: filenameOf(res.headers.get('content-disposition')),
        };
        return { data: file as T, headers: responseHeaders };
      }
      const text = await res.text();
      if (req.as === 'text' || !text) return { data: (req.as === 'text' ? text : null) as T, headers: responseHeaders };
      try {
        return { data: JSON.parse(text) as T, headers: responseHeaders };
      } catch {
        return { data: text as T, headers: responseHeaders };
      }
    }
  }

  private async fetchOnce(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body: BodyInit | undefined,
    timeoutMs: number,
    outer?: AbortSignal,
  ): Promise<Response> {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(outer?.reason);
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
    try {
      return await this.fetchImpl(url, { method, headers, body, signal: ctrl.signal });
    } catch (err) {
      if (outer?.aborted) throw err;
      const timedOut = ctrl.signal.aborted;
      throw new SendClipperConnectionError(
        timedOut
          ? `SendClipper did not answer within ${timeoutMs} ms (${method} ${url.pathname}).`
          : `Could not reach SendClipper at ${this.baseUrl}: ${(err as Error).message}`,
        err,
      );
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }
}

function backoffMs(attempt: number): number {
  const base = Math.min(8_000, 500 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

function retryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_AFTER_MS, seconds * 1000);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - Date.now()));
}

function filenameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim() ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `encodeURIComponent` for one path segment. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

function headersOf(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function errorResponseOf(err: SendClipperApiError): ErrorResponse {
  const e: ErrorResponse = { name: err.code, message: err.message, statusCode: err.status };
  if (err.detail !== undefined) e.detail = err.detail;
  return e;
}

/** Turn a `Result` back into a value, throwing its error. Used by the iterators. */
export function unwrap<T>(res: Result<T>): T {
  if (res.error) {
    throw new SendClipperApiError(res.error.statusCode ?? 0, res.error.name, res.error.message, res.error.detail);
  }
  return res.data as T;
}
