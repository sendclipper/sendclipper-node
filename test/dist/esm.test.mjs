// Runs against the BUILT package through its own exports map, as a user would import it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import SendClipperDefault, { SendClipper, verifyWebhook, signatureHeader, VERSION } from '@sendclipper/node';

test('ESM: named and default exports resolve to the built client', async () => {
  assert.equal(SendClipperDefault, SendClipper);
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
  const sc = new SendClipper('sc_live_x', {
    baseUrl: 'https://api.test',
    fetch: async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  assert.deepEqual((await sc.domains.list()).data, []);
  const body = '{"id":"evt_1"}';
  assert.equal(verifyWebhook({ payload: body, headers: signatureHeader('whsec_x', body), secret: 'whsec_x' }).id, 'evt_1');
});
