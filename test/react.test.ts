import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { client, json } from './harness.js';

/*
 * `@react-email/render` is an optional peer dependency. The test installs a
 * stand-in under node_modules so the real import path is exercised without
 * pulling React into the SDK's own dev dependencies.
 */
const dir = new URL('../node_modules/@react-email/render/', import.meta.url);
if (existsSync(dir)) throw new Error('A real @react-email/render is installed; this test would overwrite it.');
mkdirSync(dir, { recursive: true });
after(() => rmSync(new URL('../', dir), { recursive: true, force: true }));
writeFileSync(
  new URL('package.json', dir),
  JSON.stringify({ name: '@react-email/render', version: '0.0.0-test', main: 'index.js' }),
);
writeFileSync(
  new URL('index.js', dir),
  `exports.render = async (node, opts) => opts && opts.plainText ? 'TEXT:' + node.name : '<h1>' + node.name + '</h1>';`,
);

test('react is rendered to html and text before the request; react itself is never sent', async () => {
  const { sc, calls } = client([json(201, { id: 'e1' })]);
  const { error } = await sc.emails.send({ from: 'a@acme.io', to: 'b@lumen.io', subject: 'Hi', react: { name: 'Ada' } });
  assert.equal(error, null);
  assert.deepEqual(calls[0]!.body, { from: 'a@acme.io', to: 'b@lumen.io', subject: 'Hi', html: '<h1>Ada</h1>', text: 'TEXT:Ada' });
});

test('a text you give wins over the rendered one', async () => {
  const { sc, calls } = client([json(201, { id: 'e1' })]);
  await sc.emails.send({ from: 'a@acme.io', to: 'b@lumen.io', subject: 'Hi', react: { name: 'Ada' }, text: 'mine' });
  assert.equal((calls[0]!.body as { text: string }).text, 'mine');
});

test('batch items with react are rendered one by one', async () => {
  const { sc, calls } = client([json(200, { data: [], summary: { submitted: 2, accepted: 2, failed: 0 } })]);
  await sc.batch.send([
    { from: 'a@acme.io', to: 'x@lumen.io', subject: 's', react: { name: 'X' } },
    { from: 'a@acme.io', to: 'y@lumen.io', subject: 's', html: '<p>plain</p>' },
  ]);
  const { emails } = calls[0]!.body as { emails: Array<{ html: string }> };
  assert.deepEqual(emails.map((e) => e.html), ['<h1>X</h1>', '<p>plain</p>']);
});
