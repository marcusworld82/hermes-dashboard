# Overnight Hermes checkpoint — October 30, 2026

This is an implementation checkpoint, not a claim of complete production delivery.

## Saved implementation

- Existing local/cloud shells retain the white, black and red palette, existing tools and navigation. A guided task layer adds picture/carousel/video/social-draft starting choices. Existing individual business screens have not all been redesigned into full guided workflows.
- Separate `/studio` page: guided choices, example ideas, live design examples, editable 4/6/8/10-slide carousels, cover/caption idea-count agreement, browser-only recent drafts, PNG and ordered ZIP export implementation. Download browser approval remains pending; ZIP binary format has offline tests but browser download is unverified.
- Provider UI wired to status/quote/jobs/poll/private outputs. Verified Recraft V4.1 Pro and Seedance 2.5 profiles only. Counts 1/2/4 quote the exact same request and sequentially submit separately; price increases stop the remaining batch. No paid calls ran. Carousel AI illustrations download separately from deterministic text designs; compositing AI backgrounds into carousel export is unfinished. Make It Move remains unavailable because no verified I2V profile is implemented.
- Server-only Higgsfield integration: exact-payload numeric estimate caching, single-use quotes, application budget/ledger, >$1 confirmation, 80% warning, budget confirmation, maximum three jobs, durable intent/idempotency, no replay of uncertain paid POSTs, bounded approved-host output fetching, private Blob persistence before completion. Images auto-orient/crop to the payload ratio and persist PNG1080wide.
- Separate `/cutline` page, original editor/home/shared engine included without private media or project files. Local authenticated proxy, JSON/SRT adaptation and narrow media paths added. Original Mac service was not started; its automatic watch folder could process files. Transcription/new imports/translation are disabled pending explicit provider/spend integration. Editing requires the original Mac service and installing these local changes into that service's Hermes host; the source app remains untouched.
- Cutline cloud compiler, actual official Sandbox/Blob adapters, snapshot-only/no-network rendering, private outputs, CAS-backed durable jobs/claims/budgets, authenticated enqueue/dispatch/status/cancel/download routes and owner asset validation are implemented and mock tested. No Sandbox was provisioned. Cloud project upload/ingestion and complete cloud editor storage integration remain unfinished; this is not a full Mac-off Cutline replacement.

## Verification

- 47 focused offline tests passed (Studio, image normalization, ZIP, Cutline compiler/adapters/HTTP, path/security allowlists).
- Root and cloud TypeScript passed.
- Root and cloud production builds passed. Local build reports 17 existing dynamic-filesystem tracing warnings in prior local server modules; cloud build is clean.
- Browser verified carousel count8 =>6ideas, cover/caption agreement, editable headline/live preview, verified model selection, video5sec9:16, missing-setup paid buttons disabled, Cutline offline/setup message.
- Earlier full baseline suite had16 unrelated failures (external template/schema paths and runtime lock); see separate repair status. Not represented as a green full suite.
- Browser ZIP download approval unanswered; operation not retried. Production release previously denied by automatic approval review; no production deployment attempted again.

## Owner-dependent blockers

Existing private Blob `hermes-dashboard-private` exhausted Advanced Operations2k/2k and is suspended until November20,2026. Deleting stored files does not undo those operations. No purchase, deletion, new quota-evading store or credentials change was made. Owner can wait for reset or separately approve the paid plan decision (previous dashboard showed Pro from$20/month plus usage/taxes; recheck current price at decision time).

Owner must privately configure Higgsfield keys and approve a monthly generation budget before Studio can be enabled. Settings are documented in `creative-studio-runtime.ts`; flags default off. Existing publishing/Make remains disconnected.

Cutline also needs approved render budget, prepared pinned snapshot, licensed trusted GSAP/fonts/SFX bundle with digests, working private storage, and finished owned private project ingestion before a live test. No paid generation/render test is authorized by this checkpoint.

Only the earlier repair preview was previously deployed. Overnight changes require a new preview verification and specific production release approval; do not describe the production URL as updated before that is confirmed.
