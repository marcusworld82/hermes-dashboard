# Persistent host Gmail runtime, prepared for review

This code has not been deployed or delivery-tested on a host. Mac-off acceptance remains untested. No real email, OAuth token acquisition, Notion write, or purchase was performed during preparation.

The reviewed architecture is one always-on Next app plus one `node scripts/cloud-mail-server.mjs` process on the same persistent disk. No public worker endpoint exists. Each tick awaits completion before waiting 60 seconds. SQLite WAL transactions coordinate automatic and manual release. Run one worker instance. Serverless runtimes remain blocked.

Required environment:

- `HERMES_DEPLOYMENT_MODE=persistent-host`
- `HERMES_DATA_DIR=/var/lib/hermes`, an actual persistent disk, not a temporary directory
- `HERMES_PERSISTENT_DISK_CONFIRMED=true`
- `NOTION_API_TOKEN`, server-only integration secret
- `NOTION_COMPANIES_DATA_SOURCE_ID=e52e94bc-1536-4467-b595-80cafadf63fa`
- `NOTION_PEOPLE_DATA_SOURCE_ID=a814d082-803b-4f07-b69d-81afadd329cb`
- Existing Gmail client ID, secret, HTTPS redirect URI and encryption key

`HERMES_LEGACY_SENDER_DISABLED=true` is required before activating or releasing lead emails. It is not required for OAuth, the explicit authenticated-self test, or draft preview. This flag is an operator attestation, not a remote verification of the Mac. Verify the old CRM sender is actually off before setting it.

`node scripts/cloud-mail-server.mjs --check` validates static host and Notion configuration only. It makes no API requests. Normal execution and `--once` can send approved emails when all gates pass. Do not use either as a no-send check.

The normal sender switch defaults off. The queue also starts paused. Exact approval, verified self-test, standing daily consent, fresh live lead/draft and parent suppression checks, inbox reply checks, daily limits and New York time windows remain required. Changing the deployment mode does not activate sending.

Every host preview and release reads Notion directly using API version 2026-03-11, fixed API endpoints and approved source membership. Missing fields, incomplete relations and failed reads block release. Individual contacts inherit denial and do-not-contact from their parent companies. Host Notion editing elsewhere in the dashboard is outside this adapter.

Delivery events stay in the queue and durable reconciliation log. Automatic stage writes default off. `HERMES_NOTION_STAGE_WRITES_APPROVED=true` permits field-level Stage writes after two fresh revision checks and a confirmation read. Notion offers no conditional compare-and-swap update, so a final race with a human edit cannot be eliminated. Leave this flag off if that limitation is unacceptable. Events then remain pending and visible for manual reconciliation. Bounce suppression still blocks mail independently of Notion stage writes. No invented Bounced stage is used.

`HERMES_HISTORY_RECONCILED=true` is separately required for lead release after reviewed history migration. OAuth and self-test stay available before that attestation. Cutover must preserve historical deliveries and permanent suppression records. Never start with an empty history if the same leads were already contacted. Local and direct-host revision hashes differ, so pending approvals need a fresh host preview and explicit approval. Do not blindly replay copied pending queue items. Keep the token encryption key separately from encrypted token backups, restrict file permissions, and back up SQLite using a consistent SQLite backup operation rather than copying only a live main file without its WAL.

Caddy authentication and HTTPS, private loopback binding, service users, persistent disk provisioning, backup/restore and monitoring are deployment requirements handled by the host review bundle. A configuration flag does not prove those requirements were met. Validate connected self-test delivery, suppression, one approved release, restart recovery and Mac-off operation only after separate deployment approval.

This worker runs Gmail release and delivery-event reconciliation only. It does not run paid discovery, content generation, morning research, or Telegram notices.
