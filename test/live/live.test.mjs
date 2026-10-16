/**
 * Live end-to-end: the BUILT package, imported through its own exports map,
 * against a real SendClipper API with an `sc_live_` key minted for this run.
 *
 *   npm run build
 *   LIVE_API_URL=http://localhost:4000 npm run test:live
 *
 * It refuses anything that is not localhost: it creates and deletes data and
 * sends mail through whatever transport the API has, which must be the local
 * SES emulator (checked on /v1/health before anything runs).
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { SendClipper, signatureHeader } from '@sendclipper/node';

const API = process.env.LIVE_API_URL ?? 'http://localhost:4000';
const EMAIL = process.env.LIVE_EMAIL ?? 'enis@sendclipper.dev';
const PASSWORD = process.env.LIVE_PASSWORD ?? 'password';
const RUN = `sdk${Date.now().toString(36)}`;

assert.match(new URL(API).hostname, /^(localhost|127\.0\.0\.1)$/, 'the live test runs against a local API only');

let jwt = '';
let keyId = '';
/** @type {SendClipper} */
let sc;
let from = '';
const cleanup = [];

async function rest(method, path, body) {
  const res = await fetch(`${API}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

/** Assert a Result succeeded and hand back its data. */
function ok(result, what) {
  assert.equal(result.error, null, `${what}: ${JSON.stringify(result.error)}`);
  return result.data;
}

before(async () => {
  const health = await (await fetch(`${API}/v1/health`)).json();
  const b = health.backends ?? {};
  assert.ok(b.sesSend === 'local' && b.objectStore === 'filesystem', `refusing a non-local API: ${JSON.stringify(b)}`);

  const login = await (
    await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
  ).json();
  jwt = login.token;
  assert.ok(jwt, `login failed: ${JSON.stringify(login)}`);
  const key = await rest('POST', '/api-keys', { name: `${RUN}-full`, permission: 'full' });
  keyId = key.id;
  sc = new SendClipper(key.token, { baseUrl: API });

  const domains = ok(await sc.domains.list(), 'domains.list');
  const verified = domains.find((d) => d.status === 'verified' && !d.name.endsWith('.example.com'));
  assert.ok(verified, 'the seeded workspace needs a verified domain');
  from = `sdk-live@${verified.name}`;
});

after(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => undefined);
  if (keyId) await rest('DELETE', `/api-keys/${keyId}`).catch(() => undefined);
});

test('workspace and api keys read back with the minted key', async () => {
  const ws = ok(await sc.workspace.get(), 'workspace.get');
  assert.ok(ws.publicId);
  const keys = ok(await sc.apiKeys.list(), 'apiKeys.list');
  assert.ok(keys.some((k) => k.id === keyId));
});

test('emails.send → emails.get, and a repeated idempotency key answers the first send', async () => {
  const idempotencyKey = `${RUN}-welcome`;
  const params = { from, to: `ada+${RUN}@lumen.io`, subject: `SDK live ${RUN}`, html: '<p>Hello from the SDK</p>', text: 'Hello from the SDK' };
  const first = ok(await sc.emails.send(params, { idempotencyKey }), 'emails.send');
  assert.equal(first.to, params.to);
  const again = await sc.emails.send(params, { idempotencyKey });
  assert.equal(ok(again, 'emails.send replay').id, first.id);
  assert.equal(again.headers?.['idempotency-replayed'], 'true');

  const detail = ok(await sc.emails.get(first.id), 'emails.get');
  assert.equal(detail.subject, params.subject);
  assert.ok(Array.isArray(detail.events));
});

test('an API refusal comes back as { error } with the API code, never a throw', async () => {
  const { data, error } = await sc.emails.send({ from: 'nobody@not-a-domain-we-own.test', to: 'a@lumen.io', subject: 's', html: 'h' });
  assert.equal(data, null);
  assert.equal(error.statusCode, 403);
  assert.ok(error.name.length > 0 && error.message.length > 0, JSON.stringify(error));

  const invalid = await sc.emails.send({ from, to: 'not-an-address', subject: 's', html: 'h' });
  assert.equal(invalid.error?.name, 'validation_failed');
});

test('batch.send accepts and refuses items independently', async () => {
  const res = ok(
    await sc.batch.send([
      { from, to: `b1+${RUN}@lumen.io`, subject: 'batch 1', html: '<p>1</p>' },
      { from, to: `b2+${RUN}@lumen.io`, templateId: 'tpl_doesnotexist0' },
    ]),
    'batch.send',
  );
  assert.equal(res.summary.submitted, 2);
  assert.equal(res.data[0].status, 'accepted');
  assert.equal(res.data[1].status, 'failed');
});

test('templates: create → preview → publish → send by id → remove', async () => {
  const t = ok(
    await sc.templates.create({
      name: `${RUN} welcome`,
      subject: 'Welcome {{first_name|there}}',
      blocks: [{ type: 'text', text: 'Hi {{first_name|there}}, welcome aboard.' }],
    }),
    'templates.create',
  );
  cleanup.push(() => sc.templates.remove(t.id));
  const preview = ok(await sc.templates.preview(t.id, { first_name: 'Ada' }), 'templates.preview');
  assert.equal(preview.subject, 'Welcome Ada');
  ok(await sc.templates.publish(t.id), 'templates.publish');
  const sent = ok(
    await sc.emails.send({ from, to: `t+${RUN}@lumen.io`, templateId: t.publicId, variables: { first_name: 'Ada' } }),
    'emails.send(template)',
  );
  assert.equal(sent.subject, 'Welcome Ada');
});

test('sandboxes: create → reset credentials → send with the sandbox token → waitFor → raw → remove', async () => {
  const box = ok(await sc.sandboxes.create({ name: `${RUN}-box` }), 'sandboxes.create');
  cleanup.push(() => sc.sandboxes.remove(box.id));
  const creds = ok(await sc.sandboxes.resetCredentials(box.id), 'sandboxes.resetCredentials');
  assert.match(creds.apiToken, /^sc_sbx_/);

  const subject = `trapped ${RUN}`;
  ok(await sc.sandboxes.send(creds.apiToken, { from: 'app@example.com', to: 'someone@example.com', subject, html: '<p>trap</p>' }), 'sandboxes.send');
  const msg = ok(await sc.sandboxes.messages.waitFor(box.id, { match: (m) => m.subject === subject, timeoutMs: 15_000, intervalMs: 300 }), 'waitFor');
  assert.equal(msg.subject, subject);
  const raw = ok(await sc.sandboxes.messages.raw(box.id, msg.id), 'messages.raw');
  assert.match(raw, new RegExp(`Subject: ${subject}`));
});

test('webhooks: create returns the secret once; verify() accepts a signature made with it', async () => {
  const hook = ok(await sc.webhooks.create({ url: 'http://127.0.0.1:9/sdk-live', events: ['email.delivered', 'email.bounced'], allowInsecureHttp: true }), 'webhooks.create');
  cleanup.push(() => sc.webhooks.remove(hook.id));
  assert.match(hook.secret, /^whsec_/);
  const body = JSON.stringify({ id: 'evt_live', event: 'email.delivered', createdAt: new Date().toISOString(), data: {} });
  assert.equal(sc.webhooks.verify({ payload: body, headers: signatureHeader(hook.secret, body), secret: hook.secret }).id, 'evt_live');

  const updated = ok(await sc.webhooks.update(hook.id, { events: ['email.opened'] }), 'webhooks.update');
  assert.deepEqual(updated.events, ['email.opened']);
  const rotated = ok(await sc.webhooks.rotateSecret(hook.id), 'webhooks.rotateSecret');
  assert.notEqual(rotated.secret, hook.secret);
  const page = ok(await sc.webhooks.dispatches.list({ state: 'all', limit: 5 }), 'dispatches.list');
  assert.ok(Array.isArray(page.data));
});

test('suppressions: add → find → remove with a reason', async () => {
  const email = `blocked+${RUN}@lumen.io`;
  const { created, row } = ok(await sc.suppressions.create({ email, note: 'sdk live test' }), 'suppressions.create');
  assert.equal(created, true);
  const found = ok(await sc.suppressions.list({ q: email }), 'suppressions.list');
  assert.ok(found.data.some((s) => s.email === email));
  ok(await sc.suppressions.remove(row.id, 'Removed by the SDK live test run'), 'suppressions.remove');
});

test('contacts and iterators', async () => {
  const c = ok(await sc.contacts.create({ name: 'SDK Live', email: `contact+${RUN}@lumen.io` }), 'contacts.create');
  assert.equal(c.email, `contact+${RUN}@lumen.io`);
  let n = 0;
  for await (const e of sc.emails.iterate({ search: RUN, pageSize: 2 })) {
    assert.ok(e.id);
    n++;
  }
  assert.ok(n >= 3, `expected this run's sends in the log, saw ${n}`);
});
