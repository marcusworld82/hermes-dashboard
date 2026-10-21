# Morning pipeline completion notes

Prepared and tested with fakes. No model call, discovery run, email, Telegram message, Notion write, deployment or restart was performed during this work.

The existing minute worker now dispatches separate durable stages in New York time:

| Time | Step | Evidence |
| --- | --- | --- |
| 7:00 | Discovery | Same approved quote/start path, existing daily cap and legacy schedule guard |
| 7:15 | Verify leads | Fresh Notion read, today's lead evidence, existing-master contact/domain duplicates, permanent email suppression and the legacy CRM/Prospects outreach history |
| 7:30 | Rico drafts | Missing drafts only, approved lead-filter template file, fresh revision checks before Notion writes |
| 7:40 | Source research and Maya ideas | Source excerpts, URLs and observed dates; headline-only entries cannot generate ideas |
| 7:50 | Quinn review | Every current idea and draft covered exactly once; human approval still required |
| 8:00 | Brief | Local counts/errors/cost evidence plus one idempotent Notion Run Log record per day |

The morning switch remains off by default. Existing discovery consent does not authorize model work. A separate switch permits up to three Claude subscription calls per New York day, shared across automatic and manual actions. Each call requires verified subscription authentication, global runs enabled and the named agent policy. API/unknown billing is rejected. Each call has a three-minute timeout and a $0.15 provider ceiling. Failed or uncertain attempts keep their daily reservation. Subscription cash cost is unknown, never reported as free.

A started morning can catch up before 8. New discovery and model stages do not start after 8; an 8 AM brief can finish through 8:15. The clock is rechecked between stages. Work already running can finish later, so the app does not guarantee completion by 8. A crashed claimed step is visible as running and never silently retried. Manual actions provide an explicit path after inspection, within the same daily model limit. No previous day is replayed.

Sources ship empty. Supported paths are public HTTPS RSS, Reddit subreddit/search feeds, YouTube channel feeds, with handles resolved only from unambiguous public canonical/channel metadata, and readable public website text. Reddit reads are sequential with spacing. Source reads are cached for five minutes and bounded to 20 sources, 1 MB each and a total request deadline. DNS is checked and pinned; redirects, private hosts and credentials in URLs are blocked. X, Instagram, newsletters without a public feed, show a connector requirement. YouTube handles without unambiguous metadata require the explicit channel-ID URL. Nothing silently falls back to paid scraping.

Ideas are rough hypotheses, not finished posts. Each stores a source URL, publication date when present, and an exact source excerpt. Quinn cannot approve sending or publication. Ideas are visible in Content Research, Content Machine and the Home integration. Publication and exact-email approval gates are unchanged.

Remaining live checks and limits:

- No real morning run has been exercised. Credentials, the awake Mac, subscription login and explicit switches are required.
- Website HTTP checks remain in the discovery worker. The 7:15 stage verifies saved evidence, not a new website crawl.
- `LEAD_FILTERS_PATH` can override the default `~/Desktop/LYFE WITH MARCUS/AI Content Business/01-Offer/lead-filters.md`. Missing templates block Rico rather than invent replacements.
- Notion full-run log failures leave a pending local record. Refresh brief retries the same stable Run ID.
- Morning Telegram summaries have a separate off-default exact-chat consent and text preview. Existing queue-alert consent does not authorize them. One durable daily claim prevents retry after uncertain delivery. No actual message was sent during implementation.
- Model output still requires human review. Exact source quotes prevent invented evidence citations, but do not prove every generated interpretation is true.
- Source copies are local cached observations. Sources with no readable body produce no ideas.

The content worker heartbeat now runs every ten seconds independently of long work. It never dispatches jobs and is cleared when the worker exits.
