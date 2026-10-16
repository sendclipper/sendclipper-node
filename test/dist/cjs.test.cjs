// Runs against the BUILT package through its own exports map, as a CommonJS user would require it.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SendClipper, SendClipperApiError, verifyWebhook, signatureHeader } = require('@sendclipper/node');

test('CJS: require() resolves the CommonJS build', async () => {
  assert.equal(typeof SendClipper, 'function');
  assert.equal(typeof SendClipperApiError, 'function');
  const sc = new SendClipper({
    apiKey: 'sc_live_x',
    baseUrl: 'https://api.test',
    fetch: async () => new Response('{"error":{"code":"not_found","message":"nope"}}', { status: 404 }),
  });
  const { data, error } = await sc.emails.get('x');
  assert.equal(data, null);
  assert.deepEqual(error, { name: 'not_found', message: 'nope', statusCode: 404 });
  const body = '{"id":"evt_2"}';
  assert.equal(verifyWebhook({ payload: body, headers: signatureHeader('whsec_x', body), secret: 'whsec_x' }).id, 'evt_2');
});
