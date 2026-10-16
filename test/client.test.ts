import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SendClipper, SendClipperApiError, VERSION } from '../src/index.js';
import { client, fakeFetch, json } from './harness.js';

const SENT = {
  id: '0b6c0000-0000-4000-8000-000000000001',
  messageId: 'msg_9f2b7c10ad',
  sesMessageId: null,
  from: 'hello@acme.io',
  to: 'ada@lumen.io',
  domain: 'acme.io',
  subject: 'Hi',
  status: 'queued',
  createdAt: '2026-10-16T10:00:00.000Z',
  templateId: null,
};

test('emails.send posts the params to /v1/emails with the key and an idempotency key', async () => {
  const { sc, calls } = client([json(201, SENT)]);
  const { data, error, headers } = await sc.emails.send({ from: 'hello@acme.io', to: 'ada@lumen.io', subject: 'Hi', html: '<p>Hi</p>' });

  assert.equal(error, null);
  assert.deepEqual(data, SENT);
  assert.equal(headers?.['content-type'], 'application/json');
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call!.method, 'POST');
  assert.equal(call!.url.href, 'https://api.test/v1/emails');
  assert.equal(call!.headers.Authorization, 'Bearer sc_live_test');
  assert.equal(call!.headers['Content-Type'], 'application/json');
  assert.equal(call!.headers['User-Agent'], `sendclipper-node/${VERSION}`);
  assert.match(call!.headers['Idempotency-Key']!, /^sc-node-[0-9a-f-]{36}$/);
  assert.deepEqual(call!.body, { from: 'hello@acme.io', to: 'ada@lumen.io', subject: 'Hi', html: '<p>Hi</p>' });
});

test('a template send carries templateId and variables, and a caller key is used as given', async () => {
  const { sc, calls } = client([json(201, SENT)]);
  await sc.emails.send(
    { from: 'hello@acme.io', to: 'ada@lumen.io', templateId: 'tpl_9f2b7c10ad42', variables: { first_name: 'Ada' } },
    { idempotencyKey: 'order-42-receipt' },
  );
  assert.equal(calls[0]!.headers['Idempotency-Key'], 'order-42-receipt');
  assert.deepEqual(calls[0]!.body, {
    from: 'hello@acme.io',
    to: 'ada@lumen.io',
    templateId: 'tpl_9f2b7c10ad42',
    variables: { first_name: 'Ada' },
  });
});

test('a 503 is retried with the SAME idempotency key, so the retry cannot send twice', async () => {
  const { sc, calls } = client([json(503, { error: { code: 'unavailable', message: 'down' } }), json(201, SENT)]);
  const { data } = await sc.emails.send({ from: 'a@acme.io', to: 'b@lumen.io', subject: 's', html: 'h' });
  assert.equal(data?.id, SENT.id);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.headers['Idempotency-Key'], calls[1]!.headers['Idempotency-Key']);
});

test('a network error is retried, then answers error network_error with a null status', async () => {
  const { sc, calls } = client([new TypeError('fetch failed'), new TypeError('fetch failed')], { maxRetries: 1 });
  const { data, error } = await sc.emails.get('x');
  assert.equal(data, null);
  assert.equal(error?.name, 'network_error');
  assert.equal(error?.statusCode, null);
  assert.match(error!.message, /Could not reach SendClipper at https:\/\/api\.test/);
  assert.equal(calls.length, 2);
});

test('429 honours Retry-After', async () => {
  const { sc, calls } = client([json(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '0' }), json(200, [])]);
  const started = Date.now();
  assert.deepEqual((await sc.domains.list()).data, []);
  assert.equal(calls.length, 2);
  assert.ok(Date.now() - started < 400, 'Retry-After: 0 should not wait for the backoff');
});

test('idempotency_key_in_flight (409) is retried; any other 409 is not', async () => {
  const inFlight = json(409, { error: { code: 'idempotency_key_in_flight', message: 'wait' } }, { 'Retry-After': '0' });
  const { sc, calls } = client([inFlight, json(201, SENT)]);
  await sc.emails.send({ from: 'a@acme.io', to: 'b@lumen.io', subject: 's', html: 'h' });
  assert.equal(calls.length, 2);

  const other = client([json(409, { error: { code: 'sandbox_name_taken', message: 'taken' } })]);
  const { error } = await other.sc.sandboxes.create({ name: 'x' });
  assert.deepEqual(error, { name: 'sandbox_name_taken', message: 'taken', statusCode: 409 });
  assert.equal(other.calls.length, 1);
});

test('a 4xx is not retried and the API envelope becomes a typed error', async () => {
  const { sc, calls } = client([
    json(400, { error: { code: 'template_variables_missing', message: 'Missing first_name', detail: { missing: ['first_name'] } } }),
  ]);
  const { data, error } = await sc.emails.send({ from: 'a@acme.io', to: 'b@lumen.io', templateId: 'tpl_x' });
  assert.equal(data, null);
  assert.deepEqual(error, {
    name: 'template_variables_missing',
    message: 'Missing first_name',
    statusCode: 400,
    detail: { missing: ['first_name'] },
  });
  assert.equal(calls.length, 1);
});

test('a validation error (Nest default shape) becomes code validation_failed', async () => {
  const { sc } = client([json(400, { statusCode: 400, message: ['to must be a valid email address'], error: 'Bad Request' })]);
  const { error } = await sc.emails.send({ from: 'a@acme.io', to: 'nope', subject: 's', html: 'h' });
  assert.equal(error?.name, 'validation_failed');
  assert.equal(error?.message, 'to must be a valid email address');
});

test('GET requests carry no idempotency key and drop empty query values', async () => {
  const { sc, calls } = client([json(200, { items: [], total: 0, totalCapped: false, page: 1, pageSize: 50 })]);
  await sc.emails.list({ status: 'bounced', search: '', domain: undefined, pageSize: 50 });
  const call = calls[0]!;
  assert.equal(call.headers['Idempotency-Key'], undefined);
  assert.equal(call.url.search, '?status=bounced&pageSize=50');
});

test('emails.iterate walks every page and stops on the last', async () => {
  const row = (n: number) => ({ ...SENT, id: `id-${n}` });
  const { sc, calls } = client([
    json(200, { items: [row(1), row(2)], total: 3, totalCapped: false, page: 1, pageSize: 2 }),
    json(200, { items: [row(3)], total: 3, totalCapped: false, page: 2, pageSize: 2 }),
  ]);
  const ids: string[] = [];
  for await (const e of sc.emails.iterate({ pageSize: 2 })) ids.push(e.id);
  assert.deepEqual(ids, ['id-1', 'id-2', 'id-3']);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.url.searchParams.get('page'), '2');
});

test('suppressions.iterate follows the cursor', async () => {
  const s = (email: string) => ({ id: email, email, reason: 'manual', scope: 'all' });
  const { sc, calls } = client([
    json(200, { data: [s('a@x.io')], page: { cursor: 'c1', hasMore: true }, counts: {} }),
    json(200, { data: [s('b@x.io')], page: { cursor: null, hasMore: false }, counts: {} }),
  ]);
  const seen: string[] = [];
  for await (const row of sc.suppressions.iterate({ reason: 'manual' })) seen.push(row.email);
  assert.deepEqual(seen, ['a@x.io', 'b@x.io']);
  assert.equal(calls[1]!.url.searchParams.get('cursor'), 'c1');
  assert.equal(calls[1]!.url.searchParams.get('reason'), 'manual');
});

test('suppressions.remove sends the recorded reason as the DELETE body', async () => {
  const { sc, calls } = client([json(200, { removed: true })]);
  await sc.suppressions.remove('sup-1', 'Customer asked us to resume mail');
  assert.equal(calls[0]!.method, 'DELETE');
  assert.equal(calls[0]!.url.pathname, '/v1/suppressions/sup-1');
  assert.deepEqual(calls[0]!.body, { reason: 'Customer asked us to resume mail' });
});

test('sandboxes.send uses the sandbox token instead of the API key', async () => {
  const { sc, calls } = client([json(201, { id: 'sbx-msg' })]);
  await sc.sandboxes.send('sc_sbx_abc', { from: 'a@acme.io', to: 'b@lumen.io', subject: 's', html: 'h' });
  assert.equal(calls[0]!.url.pathname, '/v1/sandbox/emails');
  assert.equal(calls[0]!.headers.Authorization, 'Bearer sc_sbx_abc');
});

test('contacts.import is multipart, carries no idempotency key and is never retried', async () => {
  const { sc, calls } = client([json(503, { error: { code: 'unavailable', message: 'down' } })]);
  const { error } = await sc.contacts.import({ file: 'name,email\nAda,ada@lumen.io\n', filename: 'contacts.csv', onDuplicate: 'update' });
  assert.equal(error?.statusCode, 503);
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.headers['Idempotency-Key'], undefined);
  assert.equal(call.headers['Content-Type'], undefined, 'fetch sets the multipart boundary itself');
  const form = call.rawBody as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('onDuplicate'), 'update');
  const file = form.get('file') as File;
  assert.equal(file.name, 'contacts.csv');
  assert.equal(await file.text(), 'name,email\nAda,ada@lumen.io\n');
});

test('templates.assets.upload base64-encodes bytes', async () => {
  const { sc, calls } = client([json(201, { id: 'a', publicId: 'tpa_1', url: 'https://x/y.png', mimeType: 'image/png', bytes: 3, name: 'logo', createdAt: '' })]);
  await sc.templates.assets.upload({ mimeType: 'image/png', data: new Uint8Array([1, 2, 3]), name: 'logo' });
  assert.deepEqual(calls[0]!.body, { mimeType: 'image/png', base64: 'AQID', name: 'logo' });
});

test('text endpoints return the body as a string', async () => {
  const { sc } = client([new Response('<html>hi</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })]);
  assert.equal((await sc.templates.html('tpl_1')).data, '<html>hi</html>');
});

test('an attachment download returns bytes, type and filename', async () => {
  const { sc, calls } = client([
    new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''Rechnung%20M%C3%A4rz.pdf` },
    }),
  ]);
  const { data: file } = await sc.mailboxes.messages.attachment('m1', 'msg1', 'p1');
  assert.ok(file);
  assert.deepEqual([...file.bytes], [37, 80, 68, 70]);
  assert.equal(file.contentType, 'application/pdf');
  assert.equal(file.filename, 'Rechnung März.pdf');
  assert.equal(calls[0]!.url.searchParams.get('download'), '1');
});

test('path segments are encoded', async () => {
  const { sc, calls } = client([json(200, {})]);
  await sc.templates.get('a/b?c');
  assert.equal(calls[0]!.url.pathname, '/v1/templates/a%2Fb%3Fc');
});

test('a timeout surfaces as SendClipperConnectionError naming the limit', async () => {
  const slow = () =>
    new Promise<Response>(() => {
      /* never answers; the abort rejects fetch below */
    });
  const fetchImpl = ((_: unknown, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      void slow();
    })) as typeof fetch;
  const sc = new SendClipper({ apiKey: 'k', baseUrl: 'https://api.test', fetch: fetchImpl, timeoutMs: 20, maxRetries: 0 });
  const { error } = await sc.workspace.get();
  assert.equal(error?.name, 'network_error');
  assert.match(error!.message, /within 20 ms/);
});

test('no key anywhere: a clear api_key_missing error, and no request is made', async () => {
  const saved = process.env.SENDCLIPPER_API_KEY;
  delete process.env.SENDCLIPPER_API_KEY;
  try {
    const { fetchImpl, calls } = fakeFetch([]);
    const sc = new SendClipper({ fetch: fetchImpl });
    const { error } = await sc.domains.list();
    assert.equal(error?.name, 'api_key_missing');
    assert.equal(error?.statusCode, 401);
    assert.equal(calls.length, 0);
  } finally {
    if (saved !== undefined) process.env.SENDCLIPPER_API_KEY = saved;
  }
});

test('the key and base URL fall back to the environment; a trailing /v1 is tolerated', async () => {
  const saved = { key: process.env.SENDCLIPPER_API_KEY, url: process.env.SENDCLIPPER_BASE_URL };
  process.env.SENDCLIPPER_API_KEY = 'sc_live_env';
  process.env.SENDCLIPPER_BASE_URL = 'http://localhost:4000/v1/';
  try {
    const { fetchImpl, calls } = fakeFetch([json(200, [])]);
    const sc = new SendClipper({ fetch: fetchImpl });
    await sc.domains.list();
    assert.equal(sc.baseUrl, 'http://localhost:4000');
    assert.equal(calls[0]!.url.href, 'http://localhost:4000/v1/domains');
    assert.equal(calls[0]!.headers.Authorization, 'Bearer sc_live_env');
  } finally {
    for (const [k, v] of [['SENDCLIPPER_API_KEY', saved.key], ['SENDCLIPPER_BASE_URL', saved.url]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('new SendClipper(key, options) and new SendClipper(options) are equivalent', async () => {
  const a = fakeFetch([json(200, [])]);
  await new SendClipper('sc_live_a', { baseUrl: 'https://x.test', fetch: a.fetchImpl }).domains.list();
  assert.equal(a.calls[0]!.headers.Authorization, 'Bearer sc_live_a');
  assert.equal(a.calls[0]!.url.origin, 'https://x.test');
});

test('VERSION matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.equal(VERSION, pkg.version);
});

test('an aborted call answers network_error and makes no retry', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const fetchImpl = ((_: unknown, init: RequestInit) =>
    init.signal?.aborted ? Promise.reject(new DOMException('aborted', 'AbortError')) : assert.fail('should be aborted')) as typeof fetch;
  const sc = new SendClipper({ apiKey: 'k', baseUrl: 'https://api.test', fetch: fetchImpl });
  const { error } = await sc.domains.list({ signal: ctrl.signal });
  assert.equal(error?.name, 'network_error');
  assert.equal(error?.statusCode, null);
});

test('an iterator throws SendClipperApiError, since a loop has no { error } to return', async () => {
  const { sc } = client([json(403, { error: { code: 'api_key_not_accepted', message: 'no' } })]);
  await assert.rejects(
    (async () => {
      for await (const _ of sc.contacts.iterate()) void _;
    })(),
    (err: unknown) => err instanceof SendClipperApiError && err.code === 'api_key_not_accepted' && err.status === 403,
  );
});

test('batch.send posts { emails } to /v1/emails/batch and returns the per-item results', async () => {
  const reply = {
    data: [
      { index: 0, status: 'accepted', id: 'e1', messageId: 'm1' },
      { index: 1, status: 'failed', error: { code: 'template_not_published', message: 'draft' } },
    ],
    summary: { submitted: 2, accepted: 1, failed: 1 },
  };
  const { sc, calls } = client([json(200, reply)]);
  const items = [
    { from: 'a@acme.io', to: 'x@lumen.io', subject: 's', html: 'h' },
    { from: 'a@acme.io', to: 'y@lumen.io', templateId: 'tpl_draft' },
  ];
  const { data } = await sc.batch.send(items);
  assert.deepEqual(data, reply);
  assert.equal(calls[0]!.url.pathname, '/v1/emails/batch');
  assert.deepEqual(calls[0]!.body, { emails: items });
  assert.ok(calls[0]!.headers['Idempotency-Key']);
});
