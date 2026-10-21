# Hermes integration source, October 19 2026

Marcus authorized implementation and keeping all existing Bigin MCP tools.

The live Vercel project is hermes-dashboard, project prj_xwfkDLvKKTj9lbwpZtusIF8RJ6y7. Production deployment dpl_EgZwkKgWYSzD1hT2En7j31H158Vh was deployed by CLI. The adjacent cloud/.vercel/project.json matches this project exactly. The supplied hermes-os repository is a separate demo and is not the implementation target.

Local runtime: ../app. Vercel frontend and private snapshot: ../cloud. Both use src/app and src/lib. Preserve all existing working changes. Current feature branch: feature/command-center. New files and narrowly scoped edits are used in place because the existing uncommitted runtime is required; do not replace it with a stale clean checkout.

Notion migration receipt: CRM data/notion-migration/receipt.json. 81 unique pages, 76 with email, 5 without. Source comprised 6 leads and 80 prospects with 5 overlaps. Existing 7 drafts and 8 message records remain preserved. Imports do not enqueue outreach.

Notion database: 24eb9588-cb80-4dff-9c17-81babdf5f31f. Data source: 83353f62-e55b-467c-aea1-28cdbeaa19e1.

Hermes Notion MCP authenticated successfully with 65 tools on October 19. Bigin server exists in Zoho and awaits secret URL entry into Hermes. Existing cloud transport remains an authenticated local relay with private Blob snapshots, not the proposed durable Postgres job queue. Do not label that architecture complete.
