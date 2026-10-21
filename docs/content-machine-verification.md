# Content Machine verification

Verified on October 18, 2026, America/New_York.

The deployed workspace is https://hermes-dashboard-sandy.vercel.app/social/content. Vercel serves the authenticated interface. The private Mac relay handles local APIs, media and model subscriptions. A launchd worker runs durable production tasks and explicitly enabled workflow schedules.

## Live checks

- Ten team agents returned a test reply. Saved evidence: `data/runtime-health.json`.
- Claude, Codex and OpenRouter direct bridges returned test replies. Saved evidence: `data/runtime-bridge-health.json`.
- The home prompt created a persistent Jordan conversation and displayed `HERMES_OK` in the browser.
- A two-step assigned workflow completed both steps in order. Test cards were archived and the temporary workflow removed.
- ScrapeGraph extracted five sourced entries from the official Anthropic newsroom using the Claude subscription adapter. Free OpenRouter extraction timed out, and no account privacy settings or paid fallback were enabled.
- A real script job returned 145 spoken words, a 319-word caption and a full Creative Brief. It remains a review draft.
- A cover job invoked built-in image generation through Codex and returned a 1086 by 1448 cover. This verifies the handoff, not the underlying image model version.
- Authenticated cloud requests created a workspace and uploaded an accepted cover in seven chunks. A recording request returned HTTP 206 and the requested 1024 bytes.
- Postiz returned four connected accounts. No live publication or scheduling was tested.

After removing command launches from frequent reads, local production response times were: overview 168ms, agents 19ms, connections 282ms, Kanban 19ms, pipeline 11ms and Content Machine 11ms. These are observed local timings, not service guarantees.

## Approval and recovery

Editing clears previous approvals. Scripts require explicit approval before building from a generated script. Final approval binds the media, caption, accounts and posting time. Scheduling is a separate action. Unknown publication outcomes stay on hold until Marcus checks Postiz. Active submissions cannot be manually released. Test execution did not publish, send external messages or write to Obsidian.

## Remaining validation

The supplied recording is being built in the maintained Split Talking Head template. Its automated audiovisual checks and review result must be recorded before calling that video verified. Other saved style adapters are listed as unavailable until connected and tested. Recast is stopped, and OpenAdKit's provider setup is unverified.
