/** Base class for everything this SDK throws on purpose. */
export class SendClipperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendClipperError';
  }
}

/**
 * The API answered with a non-2xx status. `code` is the API's own
 * machine-readable reason (`domain_not_verified`, `template_variables_missing`,
 * `rate_limited`, …) and is the field to branch on; `message` is a sentence
 * meant for a person.
 */
export class SendClipperApiError extends SendClipperError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
    readonly headers?: Headers,
  ) {
    super(message);
    this.name = 'SendClipperApiError';
  }
}

/** The request never got an answer: DNS, TLS, a reset socket or the timeout. */
export class SendClipperConnectionError extends SendClipperError {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SendClipperConnectionError';
  }
}

/** `webhooks.verify()` refused a delivery. `reason` says which check failed. */
export class WebhookVerificationError extends SendClipperError {
  constructor(
    readonly reason:
      | 'missing_header'
      | 'malformed_header'
      | 'timestamp_out_of_tolerance'
      | 'signature_mismatch'
      | 'invalid_payload',
    message: string,
  ) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * The API answers refusals in two shapes: the house envelope
 * `{ error: { code, message, detail? } }` and Nest's default
 * `{ statusCode, message: string | string[], error }` (request validation).
 */
export function toApiError(status: number, text: string, headers?: Headers): SendClipperApiError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const env = obj.error;
  if (env && typeof env === 'object') {
    const e = env as Record<string, unknown>;
    return new SendClipperApiError(
      status,
      String(e.code ?? codeForStatus(status)),
      String(e.message ?? `HTTP ${status}`),
      e.detail ?? e.details,
      headers,
    );
  }
  const msg = obj.message;
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const inner = (msg as Record<string, unknown>).error;
    if (inner && typeof inner === 'object') {
      const e = inner as Record<string, unknown>;
      return new SendClipperApiError(
        status,
        String(e.code ?? codeForStatus(status)),
        String(e.message ?? `HTTP ${status}`),
        e.detail,
        headers,
      );
    }
  }
  if (Array.isArray(msg)) {
    return new SendClipperApiError(status, 'validation_failed', msg.join('; '), msg, headers);
  }
  if (typeof msg === 'string') {
    return new SendClipperApiError(status, codeForStatus(status), msg, undefined, headers);
  }
  const snippet = text.trim().slice(0, 300);
  return new SendClipperApiError(status, codeForStatus(status), snippet || `HTTP ${status}`, undefined, headers);
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 413:
      return 'payload_too_large';
    case 429:
      return 'rate_limited';
    default:
      return `http_${status}`;
  }
}
