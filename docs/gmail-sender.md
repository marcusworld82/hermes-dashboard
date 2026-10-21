# Gmail sender, local safety release

This implementation is local only. It does not send anything until Marcus connects Gmail, explicitly sends and verifies a self-test, approves an exact lead email, resumes the queue, and clicks Release next approved email. Automatic release defaults off. The existing Mac worker can release approved mail after separate activation in Settings.

## Server configuration

Keep these in the server environment, never source control or the browser:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI`: the exact registered callback, ending in `/api/gmail/callback`. Local example: `http://localhost:3200/api/gmail/callback`.
- `GMAIL_TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as base64. Keep a private backup. Losing this key requires reconnecting Gmail.

Enable Gmail API in Google Cloud. Use a Web application OAuth client. Set the external consent screen to In production before connecting. Testing refresh tokens expire after 7 days for these Gmail scopes. Production does not remove consent or verification requirements. A personal unverified app can show Google's warning.

Requested scopes are `gmail.send` and `gmail.readonly`. Read access supports inbox verification, replies and delivery reports. It does not request mailbox modification or deletion.

## Storage and release

`data/gmail-queue.sqlite` stores queue snapshots, suppression, status and encrypted tokens. SQLite uses `BEGIN IMMEDIATE`, WAL and full durability. A database claim serializes all local senders. A crash after claiming a send leaves it blocked for reconciliation. Uncertain sends never retry automatically.

The queue stores the exact recipient, subject, complete body, signature, address, opt-out line and revision hash that Marcus approved. The server resolves current lead eligibility before approval and again before release. Browser requests cannot choose eligibility or replace the outgoing body.

Current lead integration uses `getLeadEmailSnapshot(id, kind)` from `lead-actions.ts`. Follow-ups remain unavailable until that resolver provides a separately saved draft. Queue rules allow one explicitly approved follow-up at least 4 days after a confirmed first email.

Release requires a successful inbox poll, a verified self-test, an unpaused queue, no unresolved send, an open New York time window and room under the daily limit. The window is 9 AM through 8:59 PM, weekdays unless weekends are enabled. Gaps are 12 minutes plus 1 to 2 minutes of positive jitter, measured from the send receipt. Daily limit defaults to 20 and cannot exceed 30.

A reply suppresses future sends. An explicit negative reply is permanently recorded as Not interested. Delivery reports mark bounces. More than 3 percent bounced among the last 30 sends, or all sends so far, pauses the queue. An observed abuse feedback report pauses the queue. Gmail does not guarantee that every recipient spam complaint is delivered as a feedback report, so this is not complete complaint telemetry.

## Endpoints

- `POST /api/gmail/connect`: creates browser-bound state and PKCE, returns Google's consent URL.
- `GET /api/gmail/callback`: verifies one-use state and browser cookie, exchanges code and encrypts tokens.
- `POST /api/gmail/test`: sends only to the authenticated account. There is no recipient parameter.
- `POST /api/gmail/verify`: requires the test message in that account's inbox.
- `POST /api/gmail/poll`: reads paginated history, falling back to a bounded full sync after an expired cursor. An incomplete scan blocks sending.
- `GET /api/outbox/preview?id=...&kind=first`: returns exact outgoing content and `draftHash`.
- `POST /api/outbox` with `{id, approvedHash, kind}`: queues the exact approved snapshot. Also accepts explicit pause, resume and cancel actions.
- `POST /api/outbox/release`: checks replies and releases at most one due approved email.

All mutations retain the dashboard's Host/Origin proxy protection. The OAuth callback uses a browser-bound cookie, random state, expiration, single-use consumption and PKCE.

## Remaining integration work

- Vercel/serverless execution is explicitly blocked. Local SQLite is not shared durable cloud storage. A cloud adapter must preserve serializable transactions, durable reservations and suppression before cloud release is enabled.
- A cloud scheduler has not been selected or purchased. Vercel Hobby cron runs at most daily and cannot support these gaps. Pro can schedule each minute, subject to approval and a durable database. Existing dashboard Origin protection must not be bypassed casually to add cron.
- Automatic email release is available on the existing Mac worker, off by default. Activate it explicitly in Settings. See `morning-automation.md`.
- The queue records reply/bounce states and notices. The local morning worker reconciles events to Notion using revision checks. Optional Telegram alerts require approval of an explicitly configured destination. Home renders saved notices.
- Uncertain sends require checking Gmail Sent mail and controlled reconciliation before resume. No button blindly retries them.
- No real OAuth connection, self-test, recipient send or cloud delivery was performed during implementation.

## Official sources checked October 20, 2026

- [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Gmail history list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Vercel cron limits and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
