import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SendClipper,
  WebhookVerificationError,
  parseSignatureHeader,
  signatureHeader,
  verifyWebhook,
} from '../src/index.js';

const SECRET = 'whsec_test_secret';
const T = 1756800000;
const BODY =
  '{"id":"evt_1","event":"email.delivered","createdAt":"2026-09-06T09:41:02.518Z","data":{"emailId":"e1","messageId":"m1","to":"user@acme.io","domain":"send.acme.io","subject":"Your receipt"}}';
/** Computed with `openssl dgst -sha256 -hmac`, not with this SDK. */
const SIG = '76921f5ba77ae7f38686e8f147da3903c0ff87100cbd47ee466b7d646d198192';
const HEADER = `t=${T},v1=${SIG}`;

function rejectsWith(reason: WebhookVerificationError['reason'], fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof WebhookVerificationError, String(err));
    assert.equal(err.reason, reason);
    return true;
  });
}

test('a genuine delivery verifies and returns the parsed event (independent vector)', () => {
  const event = verifyWebhook({ payload: BODY, headers: HEADER, secret: SECRET, nowSeconds: T + 10 });
  assert.equal(event.id, 'evt_1');
  assert.equal(event.event, 'email.delivered');
  assert.equal(event.data.to, 'user@acme.io');
});

test('header lookup works for Node, Express and Fetch header shapes, and for Buffer bodies', () => {
  const node = { 'x-sendclipper-signature-v2': HEADER, 'content-type': 'application/json' };
  const express = { 'X-SendClipper-Signature-V2': HEADER };
  const fetchHeaders = new Headers({ 'X-SendClipper-Signature-V2': HEADER });
  for (const headers of [node, express, fetchHeaders]) {
    assert.equal(verifyWebhook({ payload: Buffer.from(BODY), headers, secret: SECRET, nowSeconds: T }).id, 'evt_1');
  }
});

test('during a rotation two v1= values are sent and either one is accepted', () => {
  const other = 'a'.repeat(64);
  for (const header of [`t=${T},v1=${other},v1=${SIG}`, `t=${T},v1=${SIG},v1=${other}`]) {
    assert.equal(verifyWebhook({ payload: BODY, headers: header, secret: SECRET, nowSeconds: T }).id, 'evt_1');
  }
});

test('a changed body, a wrong secret or a wrong signature is refused', () => {
  rejectsWith('signature_mismatch', () =>
    verifyWebhook({ payload: BODY.replace('user@', 'evil@'), headers: HEADER, secret: SECRET, nowSeconds: T }),
  );
  rejectsWith('signature_mismatch', () => verifyWebhook({ payload: BODY, headers: HEADER, secret: 'whsec_other', nowSeconds: T }));
  rejectsWith('signature_mismatch', () =>
    verifyWebhook({ payload: BODY, headers: `t=${T},v1=${'0'.repeat(64)}`, secret: SECRET, nowSeconds: T }),
  );
});

test('re-serialised JSON fails, because the signature covers the raw bytes', () => {
  const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
  rejectsWith('signature_mismatch', () => verifyWebhook({ payload: reserialised, headers: HEADER, secret: SECRET, nowSeconds: T }));
});

test('a parsed object instead of the raw body is refused with a pointer to express.raw', () => {
  assert.throws(
    () => verifyWebhook({ payload: JSON.parse(BODY) as never, headers: HEADER, secret: SECRET, nowSeconds: T }),
    /express\.raw/,
  );
});

test('a timestamp outside the tolerance is refused (a replayed capture)', () => {
  rejectsWith('timestamp_out_of_tolerance', () => verifyWebhook({ payload: BODY, headers: HEADER, secret: SECRET, nowSeconds: T + 301 }));
  rejectsWith('timestamp_out_of_tolerance', () => verifyWebhook({ payload: BODY, headers: HEADER, secret: SECRET, nowSeconds: T - 301 }));
  assert.equal(verifyWebhook({ payload: BODY, headers: HEADER, secret: SECRET, nowSeconds: T + 3600, toleranceSeconds: 3600 }).id, 'evt_1');
});

test('a missing or malformed header is refused', () => {
  rejectsWith('missing_header', () => verifyWebhook({ payload: BODY, headers: {}, secret: SECRET, nowSeconds: T }));
  rejectsWith('malformed_header', () => verifyWebhook({ payload: BODY, headers: `v1=${SIG}`, secret: SECRET, nowSeconds: T }));
  rejectsWith('malformed_header', () => verifyWebhook({ payload: BODY, headers: `t=${T}`, secret: SECRET, nowSeconds: T }));
  rejectsWith('malformed_header', () => verifyWebhook({ payload: BODY, headers: `t=abc,v1=${SIG}`, secret: SECRET, nowSeconds: T }));
});

test('signatureHeader() builds what verify() accepts, for testing your own endpoint', () => {
  const header = signatureHeader(SECRET, BODY, T);
  assert.equal(header, HEADER);
  assert.deepEqual(parseSignatureHeader(header), { timestamp: T, signatures: [SIG] });
});

test('client.webhooks.verify is the same check and makes no request', () => {
  const sc = new SendClipper({ apiKey: 'k', fetch: (() => assert.fail('no request expected')) as unknown as typeof fetch });
  assert.equal(sc.webhooks.verify({ payload: BODY, headers: HEADER, secret: SECRET, nowSeconds: T }).id, 'evt_1');
});
