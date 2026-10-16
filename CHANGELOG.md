# Changelog

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
