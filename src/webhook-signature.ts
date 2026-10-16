import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookVerificationError } from './errors.js';
import type { WebhookEvent } from './types.js';

/** SendClipper's documented tolerance: five minutes. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export const SIGNATURE_HEADER = 'x-sendclipper-signature-v2';

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  /** Just the `X-SendClipper-Signature-V2` value. */
  | string;

export interface VerifyWebhookParams {
  /** The body EXACTLY as received: a string or the raw bytes. Never re-serialised JSON. */
  payload: string | Uint8Array;
  /** The request's headers (Node, Express or Fetch style), or the signature header's value. */
  headers: HeaderSource;
  /** The endpoint's `whsec_…` signing secret. */
  secret: string;
  /** Default 300. */
  toleranceSeconds?: number;
  /** For tests: the current time in seconds. */
  nowSeconds?: number;
}

/**
 * Verify a webhook delivery and return its parsed event.
 *
 * SendClipper signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends
 * `X-SendClipper-Signature-V2: t=<seconds>,v1=<hex>[,v1=<hex>]`. During a
 * secret rotation there are two `v1=` values; any match is accepted.
 *
 * @throws WebhookVerificationError when any check fails.
 */
export function verifyWebhook(params: VerifyWebhookParams): WebhookEvent {
  const { secret } = params;
  if (!secret) throw new WebhookVerificationError('missing_header', 'No webhook signing secret was given.');
  if (typeof params.payload !== 'string' && !(params.payload instanceof Uint8Array)) {
    throw new WebhookVerificationError(
      'invalid_payload',
      'payload must be the raw request body (string or Buffer), not parsed JSON. ' +
        'With Express use express.raw({ type: "application/json" }) on the webhook route.',
    );
  }
  const rawBody = typeof params.payload === 'string' ? params.payload : Buffer.from(params.payload).toString('utf8');

  const header = signatureHeaderOf(params.headers);
  if (!header) {
    throw new WebhookVerificationError('missing_header', 'The request carries no X-SendClipper-Signature-V2 header.');
  }
  const { timestamp, signatures } = parseSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) {
    throw new WebhookVerificationError('malformed_header', 'X-SendClipper-Signature-V2 has no t= or no v1= value.');
  }

  const tolerance = params.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError(
      'timestamp_out_of_tolerance',
      `The delivery was signed ${Math.abs(now - timestamp)} s from now, outside the ${tolerance} s tolerance.`,
    );
  }

  const expected = signPayload(secret, timestamp, rawBody);
  // ANY match, and every candidate is compared: a rotation sends two.
  let matched = false;
  for (const candidate of signatures) {
    if (constantTimeEquals(expected, candidate)) matched = true;
  }
  if (!matched) {
    throw new WebhookVerificationError('signature_mismatch', 'The signature does not match this secret and body.');
  }

  try {
    return JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError('invalid_payload', 'The signed body is not JSON.');
  }
}

/** `hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))`. Exported for tests of your own handler. */
export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

/** Build a valid header for a body, e.g. to test your endpoint locally. */
export function signatureHeader(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, rawBody)}`;
}

export function parseSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  const result: { timestamp: number | null; signatures: string[] } = { timestamp: null, signatures: [] };
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && /^\d+$/.test(value)) result.timestamp = Number(value);
    else if (key === 'v1' && value) result.signatures.push(value);
  }
  return result;
}

function signatureHeaderOf(source: HeaderSource): string | undefined {
  if (typeof source === 'string') return source;
  if (typeof (source as Headers).get === 'function') return (source as Headers).get(SIGNATURE_HEADER) ?? undefined;
  for (const [k, v] of Object.entries(source as Record<string, string | string[] | undefined>)) {
    if (k.toLowerCase() === SIGNATURE_HEADER) return Array.isArray(v) ? v.join(',') : v;
  }
  return undefined;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
