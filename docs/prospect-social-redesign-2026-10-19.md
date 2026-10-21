# Hermes prospect and social controls

Implemented October 19, 2026.

- Prospects reads the 81 stable Notion import mappings and enriches them with live local CRM details, seven saved drafts, and message history. Source CRM is read-only.
- List is default; Sales board groups real lead states. Existing agent Pipeline and Kanban are unchanged.
- Bulk selection supports export and Bigin contact transfer. Bigin contacts are matched by email. Existing records are not overwritten. Ambiguous matches are held. Suppressed and owner test records are excluded from new transfers. Workflow triggers are disabled. No mail tools are invoked.
- Bigin refresh saves verified IDs and opt-out flags in data/bigin-prospect-sync.json. Notion is pulled every 30 minutes by the local worker, followed by a read-only Bigin ID and opt-out reconciliation. New contacts require bulk transfer. 75 eligible contacts were transferred and verified on October 19.
- Social has a visible composer, live Postiz account discovery, image scheduling, and existing video workflow links. Request IDs prevent duplicate scheduling. Unknown provider outcomes remain visible for review.
- Recast and OpenAdKit are compact workspaces with persisted jobs and result polling. Work runs on the existing Mac worker. Recast uses its actual local analysis API. OpenAdKit campaign-kit prompts run through the existing local Claude bridge; the full original editor remains available locally.
- Background tool jobs do not automatically retry failed or interrupted model calls.

Verification: local and cloud production builds passed. Prospect mapping, Postiz outcome, cloud boundary, and tool-job validation tests passed. Four live Postiz accounts verified: Instagram, LinkedIn, Threads, TikTok. Recast health reports configured. No email or post was sent as a test. Live model generation was not used as a test.

Remaining boundaries: Notion changes flow into Hermes. New Notion prospects are not automatically promoted to Bigin; existing Bigin contact fields are not overwritten. Sales columns reflect local CRM history, not Bigin deal stages. Email approval still opens the old local CRM. Facebook is not connected to Postiz. The simple image composer accepts up to 2 MB total; larger video uses Content Machine.
