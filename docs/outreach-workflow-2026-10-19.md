# Hermes outreach workflow

Daily local discovery starts at 8 AM, or after the Mac wakes if that day has not run. It rotates existing cities and real-estate agents, brokerages, and vacation-rental management searches. Public contact research includes website contact pages and source links. No paid search fallback.

Qualified contacts receive unapproved drafts from the existing templates, with recorded names/businesses and the three supplied sample video links. Unsourced or mismatched business emails cannot be approved. Historical sent contacts are not silently enrolled again.

The local worker syncs every 10 minutes: Notion research and draft properties, email-based Bigin matching/upsert, then Bigin conversation notes. Known Notion opt-outs reach the local sender before Bigin work. Uncertain Notion creates are held for reconciliation; known archived/filtered pages are not recreated. The Notion MCP SQL allowance was reached during setup; supported unfiltered database-view queries with pagination are now used instead.

Hermes Prospects offers exact-email approval and sequence preview, decline, history and manual replies. Approval queues the first email and binds follow-up consent to the displayed sequence version. Follow-ups wait 3 days after the first send and 6 more days after the second. Edits invalidate consent. Replies, opt-outs, pauses and declines stop queued follow-ups. SMTP remains the sole sender; Bigin shows history as contact notes, not native mailbox threads.

Sending limit: 8 daily, weekdays 9 AM to 5 PM, 25 to 45 minute gaps. Inbox checks every 15 minutes plus before automated dispatch. No live outbound tests were sent during this work.

Verification: 16 targeted tests pass, both local production builds and cloud build pass. Live Vercel prospect panel verified. First discovery found 14 new businesses; 1 public email. Total library 95 records, 76 matched Bigin contacts. Six Bigin history notes created, then zero on repeat. 72 unapproved drafts saved. Some historical contacts still require business/email association review.

All background work requires the Mac awake, online, and its launchd services running. Vercel is the control panel. A VPS migration is still future work.
