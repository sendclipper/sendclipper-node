# SendClipper Node.js SDK

The official Node.js library for the [SendClipper](https://sendclipper.com) email API.

```bash
npm install @sendclipper/node
# or
pnpm add @sendclipper/node
# or
yarn add @sendclipper/node
# or
bun add @sendclipper/node
```

In a monorepo, pnpm and Yarn 1 refuse a plain add at the workspace root: use `pnpm add -w` / `yarn add -W` to install it for the whole repo, or install it into the one package that sends mail (`pnpm --filter <package> add`, `yarn workspace <package> add`, `npm install --workspace <package>`).

Node.js 20 or newer. No runtime dependencies. ESM and CommonJS.

## Setup

Create an API key in the dashboard under **API keys**.

```js
import { SendClipper } from '@sendclipper/node';

const sc = new SendClipper('sc_live_xxxxxxxxxxxxxxxx');
// or: new SendClipper()  — reads SENDCLIPPER_API_KEY
```

## Send an email

```js
const { data, error } = await sc.emails.send({
  from: 'hello@send.acme.io',
  to: 'ada@lumen.io',
  subject: 'Your receipt',
  html: '<p>Thanks for your order.</p>',
  text: 'Thanks for your order.',
});

if (error) {
  console.error(error.name, error.message); // e.g. domain_not_verified
} else {
  console.log(`Email ${data.id} accepted`);
}
```

`from` must be a bare address on a domain you verified in SendClipper. Each message has one recipient in `to`; for several, use `batch.send`.

## Send with a template

Design and publish a template in the dashboard, then send it by id or by its send name:

```js
await sc.emails.send({
  from: 'hello@send.acme.io',
  to: 'ada@lumen.io',
  templateId: 'tpl_9f2b7c10ad42', // or template: 'welcome'
  variables: { first_name: 'Ada' },
});
```

A tag with no value and no `{{tag|fallback}}` is refused by name (`template_variables_missing`), never sent blank.

## Send with React

Install `@react-email/render` and pass a component:

```jsx
import { WelcomeEmail } from './emails/welcome';

await sc.emails.send({
  from: 'hello@send.acme.io',
  to: 'ada@lumen.io',
  subject: 'Welcome',
  react: <WelcomeEmail firstName="Ada" />,
});
```

The SDK renders it to `html` and a plain-text `text` before sending.

## Send a batch

Up to 500 messages in one request. Each item is accepted or refused on its own:

```js
const { data } = await sc.batch.send([
  { from: 'hello@send.acme.io', to: 'ada@lumen.io', subject: 'Hi Ada', html: '<p>Hi</p>' },
  { from: 'hello@send.acme.io', to: 'alan@lumen.io', templateId: 'tpl_9f2b7c10ad42', variables: { first_name: 'Alan' } },
]);

for (const item of data.data) {
  if (item.status === 'failed') console.warn(item.index, item.error.code);
}
```

## Errors

API methods never throw for an API refusal or a network failure. They resolve to `{ data, error, headers }`, and exactly one of `data` and `error` is set:

```ts
type ErrorResponse = {
  name: string;              // SendClipper's code: 'validation_failed', 'rate_limited', 'network_error', …
  message: string;           // a sentence for a person
  statusCode: number | null; // null when no answer arrived (network, timeout, abort)
  detail?: unknown;          // code-specific facts
};
```

The async iterators (`emails.iterate()` and friends) throw a `SendClipperApiError` instead, since a loop has no `error` to hand back.

## Retries and idempotency

Network errors, `429` and `5xx` answers are retried twice with backoff, honouring `Retry-After`. Every JSON write carries an `Idempotency-Key`, and the API answers a repeated key with the first result for 24 hours. A retried send therefore never goes out twice.

To make your own retries safe as well (a job that runs again after a crash), pass a key that names the logical operation:

```js
await sc.emails.send(params, { idempotencyKey: `order-${order.id}-receipt` });
```

## Request options

Every method takes request options as its last argument:

```js
await sc.emails.list(
  { status: 'bounced' },
  { signal: AbortSignal.timeout(5000), headers: { 'X-Trace-Id': traceId } },
);
```

| Option | Meaning |
|---|---|
| `idempotencyKey` | Your own key for a write |
| `signal` | Abort the call |
| `timeoutMs` | Per-attempt timeout (default 30 000) |
| `maxRetries` | Retries for this call (default 2) |
| `headers` | Extra request headers |

Client options: `new SendClipper(key, { baseUrl, timeoutMs, maxRetries, fetch, defaultHeaders })`. `baseUrl` also reads `SENDCLIPPER_BASE_URL`.

## Verify webhooks

SendClipper signs each delivery. Verify it against the **raw** body, before parsing:

```js
import express from 'express';
import { verifyWebhook, WebhookVerificationError } from '@sendclipper/node';

app.post('/hooks/sendclipper', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = verifyWebhook({
      payload: req.body, // a Buffer, not parsed JSON
      headers: req.headers,
      secret: process.env.SENDCLIPPER_WEBHOOK_SECRET,
    });
    // event.id is stable across retries: deduplicate on it
    console.log(event.event, event.data.to);
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.status(400).send(err.reason);
    throw err;
  }
});
```

During a secret rotation a delivery carries two signatures and either one is accepted. A delivery signed more than five minutes away from now is refused. `sc.webhooks.verify(...)` is the same function.

To test your handler locally, `signatureHeader(secret, rawBody)` builds a valid header.

## Sandboxes

A sandbox traps mail while you develop: nothing is delivered.

```js
const { data: box } = await sc.sandboxes.create({ name: 'my-app-dev' });
const { data: creds } = await sc.sandboxes.credentials(box.id); // SMTP host, port, user, password

// Or send through the sandbox's JSON door with its own token, using the same fields as emails.send():
const { data: token } = await sc.sandboxes.resetCredentials(box.id);
await sc.sandboxes.send(token.apiToken, { from: 'app@example.com', to: 'test@example.com', subject: 'Hi', html: '<p>Hi</p>' });

// In a test: wait for the message to arrive
const { data: msg } = await sc.sandboxes.messages.waitFor(box.id, { match: (m) => m.subject === 'Hi' });
```

## Everything else

| Resource | Methods |
|---|---|
| `emails` | `send`, `get`, `list`, `iterate`, `stats` |
| `batch` | `send` |
| `domains` | `list`, `create`, `records`, `verify`, `enableReceiving`, `disableReceiving`, `setRegion`, `deletionPreview`, `remove` |
| `templates` | `list`, `get`, `html`, `create`, `update`, `remove`, `duplicate`, `publish`, `unpublish`, `preview`, `setTags`, `projects` |
| `templates.tags` | `list`, `create`, `update`, `remove` |
| `templates.assets` | `list`, `upload` |
| `sandboxes` | `list`, `get`, `create`, `update`, `remove`, `credentials`, `resetCredentials`, `send` |
| `sandboxes.messages` | `list`, `get`, `raw`, `remove`, `clear`, `markAllRead`, `waitFor` |
| `webhooks` | `list`, `create`, `update`, `remove`, `rotateSecret`, `deliveries`, `verify` |
| `webhooks.dispatches` | `list`, `iterate`, `get`, `replay`, `replayAll` |
| `contacts` | `list`, `iterate`, `create`, `import`, `importPreview`, `export` |
| `audiences` | `list` |
| `suppressions` | `list`, `iterate`, `create`, `remove`, `export` |
| `mailboxes` | `list`, `get`, `create`, `update`, `archive` |
| `mailboxes.messages` | `list`, `iterate`, `get`, `attachment` |
| `automations` | `enroll` |
| `workspace` | `get` |
| `apiKeys` | `list` |

Management routes need a key with **Full access**. A sending-only key can call `emails.send` and `batch.send`.

Full API reference: <https://sendclipper.com/docs>.

## License

MIT
