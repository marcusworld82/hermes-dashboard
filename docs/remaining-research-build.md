# Remaining research build

## Decision: legacy records move into the unified master

File 04 supersedes file 02 S9. `/prospects` now offers **Preview copy to lead master** for selected legacy records. It copies eligible records into the existing Lead Research Companies and Evidence databases. It preserves the original legacy rows. It never queues or sends messages.

Preview and confirmation both require successful fresh reads of legacy Notion and the master list. Confirmation checks the exact preview against current source content and deduplication results. Previews expire after 10 minutes and are consumed once. Unknown write results require a fresh preview, with existing master identities checked again.

Matches use source IDs, root domain, public email and normalized phone. A matching suppressed record blocks migration. Name alone never merges people or businesses. Imported records keep low confidence and source links. Contacted, replied, meeting and closed states are carried forward so old contacts do not reset to New. Existing drafts remain unapproved.

This flow is local because the legacy CRM lives on Marcus's Mac. A missing Notion connection or a read quota failure blocks migration. No live migration was performed during implementation.

## Human-gated workflow

The **Lead research pilot** template is a saved workflow with linked cards:

1. Rico estimates offline with `pilot-plan`.
2. Marcus reviews the current cost in Discovery.
3. Marcus explicitly approves discovery using its existing cost screen and waits for build completion.
4. Marcus checks Notion sync and cache visibility.
5. Quinn reviews the evidence and no-outreach rule.

Human gates never dispatch to an agent. Later cards stay blocked until the gates are explicitly confirmed. Gate completion checks required earlier cards are done. Completing a gate does not start work. Resume is a separate action. Generic Kanban unblock is blocked for gate cards and routes workflow cards back through workflow approval checks.

Cost authorization remains in Discovery, with its current quote, shared daily cap and one-use approval. Workflow notes cannot authorize a paid Actor run. Agent dispatch also uses the central agent pause and budget policy. No workflow was run live during implementation.

## Python commands

The Python README documents `enrich`, `dataset-probe`, `run-log-sync` and `--sync-run-log`. Named emails require an explicit Person JSON-LD name/email pair on the same saved official page, corroborated by that page's contact Actor result. Other layouts need manual review; names are never inferred from nearby lists.

Dataset retrieval only reads existing runs. Snapshots include a content hash, field probe and truncation status. Run Log writes use a durable pending journal and do not retry uncertain creates. Offline commands stay offline unless remote log sync is explicitly requested.

Live acceptance still needs the Apify token, accessible unexpired pilot datasets, and a Notion token or the existing Hermes connection. Paid Actor tests and live master writes were not performed. Passing fixtures do not prove provider access or live schema behavior.

## Legacy outreach guard

Local email snapshots now check legacy Prospects before first-email or follow-up approval. The release worker uses the same fresh resolver, so it checks again before sending. Matching uses root domain, case-normalized email and normalized phone. CRM global suppression and original receipt denial/contact history are retained. Sent or queued drafts, outgoing messages, inbound replies and prior sales relationships block a duplicate first email. Legacy sequences cannot become new Gmail follow-ups until their history is reconciled.

The guard requires live SQLite plus valid Notion and Bigin caches no older than 30 minutes. Missing files, unreadable data, import-only snapshots and unresolved sync errors block approval. Morning verification uses the same guard. Persistent-host delivery keeps its separate reviewed history-cutover requirement and does not load the Mac CRM.
