# Changelog

## 0.2.0 — 2026-10-18

- `emails.send()` and `sandboxes.send()` take `replyTo` (one address or a list of up to 10) and `attachments` (`{ filename, content, contentType? }`, where `content` is the bytes or a base64 string). Bytes are sent as base64 for you.
- Needs the SendClipper API from 2026-10-18 on; an older API ignores both fields.

## 0.1.3 — 2026-10-17

- README: how to install in a monorepo (pnpm `-w`, Yarn 1 `-W`, or one workspace package). No code change.

## 0.1.2 — 2026-10-16

- README: install commands for npm, pnpm, yarn and bun. No code change.

## 0.1.1 — 2026-10-16

- Released from GitHub Actions through npm trusted publishing, with provenance. No code change.

## 0.1.0 — 2026-10-16

First release.

- `emails.send`, `batch.send`, `emails.get`, `emails.list`, `emails.iterate`, `emails.stats`.
- Templates (with tags and image assets), domains, sandboxes (including the JSON door and `waitFor`), webhooks and their dispatches, contacts, audiences, suppressions, mailboxes, automations, workspace and API keys.
- Every method resolves to `{ data, error, headers }`.
- Automatic `Idempotency-Key` on every JSON write; retries on network errors, 429 and 5xx.
- `react` support through the optional `@react-email/render`.
- `verifyWebhook()` for `X-SendClipper-Signature-V2`, rotation-aware.
