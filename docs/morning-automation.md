# Morning and approved email automation

Both switches default OFF. No new timer is installed. The existing content worker's one-minute timer calls `runLocalAutomationTick` after its existing supervisor step. This Mac must be on. Cloud mode is blocked.

## Morning

Activate through Settings only after reviewing the daily cap. Activation runs read-only Actor pricing/schema checks and Notion schema preflight. It requires APIFY_TOKEN and non-empty services, niche and location. The same $0.50 maximum daily budget is shared with manual discovery.

The window is 7:00 AM through 7:59 AM America/New_York. The worker can catch up within that hour. It does not replay a previous day or a missed morning after 8 AM.

- Monday, Wednesday, Friday: side hustle discovery.
- Tuesday, Thursday, Saturday: real estate discovery.
- Sunday: no lead scrape.

A durable SQLite day claim happens before external work. A crash cannot start the day's paid discovery again automatically. A failure in discovery does not prevent RSS research. Discovery saves a job identifier and follows the existing discovery job status. RSS saves observed headlines, links, publication dates when present, source URLs and fetch time. Empty sources do nothing. Non-RSS sources are shown as skipped, pending an approved connector. No Claude drafting or paid content generation runs here.

Public RSS fetches require HTTPS, public DNS addresses, pinned validated IPs, no redirects and a 1 MB response limit. Private, loopback, reserved and transition addresses are blocked. External XML entities and DOCTYPE are rejected. Up to 20 feeds are read, in groups of four, with a request timeout.

Changing the approved offer, niche, location or cap blocks paid discovery until activation is reviewed again. Changing sender identity, daily email limit or weekend policy blocks automatic mail release until its activation is reviewed again.

## Gmail worker

Automatic release needs its own explicit activation. It requires a connected account, verified self-test and exact saved queue approvals. The queue must be resumed separately. The worker never approves drafts. It rechecks the switch and standing consent after a slow lead lookup, immediately before dispatch.

Reply scans still precede every release. Send spacing and daily limits remain enforced by the transactional Gmail queue. Manual release also blocks if the legacy CRM sender is enabled.

Sent, replied, bounced and negative-reply events receive durable reconciliation receipts. Notion updates use a fresh revision check and never overwrite Denied, Do not contact, Meeting, Client or Paused. Bounced maps to Paused because the Notion schema has no Bounced stage. Queue suppression remains authoritative for sending. Conflicts stay marked for review. Failed updates retry no sooner than five minutes. Reconciliation continues independently when automatic sending is off.

Optional Telegram queue alerts require TELEGRAM_BOT_TOKEN, GMAIL_ALERT_TELEGRAM_CHAT_ID and approval of that exact destination in Settings. No destination is inferred. An atomic durable notice claim prevents duplicate alerts across workers. Uncertain delivery is recorded and never automatically retried. This implementation session sent no Telegram messages.

## Legacy CRM conflict

Read-only audit on October 20, 2026 found both `ap_batch_on=1` and `ap_send_on=1` in the old CRM. Its stored sender limit was 8. The fallback environment cap was aligned from 10 to 8. The existing switches were not changed.

The new matching schedule cannot activate while its legacy switch is on, even if the legacy master pause is on. Turn off the matching old switch in CRM Autopilot first. There is no supported dedicated authenticated settings API in that CRM for a safe cross-app migration, so no direct database mutation was added.

## Evidence and limits

`GET /api/morning-run` returns saved day steps, worker timestamp, discovery job summaries, master-list counts and source dates, RSS results and Notion event receipts. It does not claim a queued discovery job is complete.

No live Apify run, Gmail send, Telegram message, OAuth token acquisition, deployment, build or restart was performed during implementation. Cloud scheduling still needs approved shared durable storage and a suitable host. The old CRM can continue its previously enabled jobs until Marcus changes its switches.
