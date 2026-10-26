# Social Studio verification

Date: October 25, 2026, America/New_York.

## Scope

Continued the Claude Code build using docs/handover-social-studio/00-START-HERE.md as authority. Local Mac only. No account creation, posting, cloud deployment, or dependency upgrade.

## Changes

- Added the Social Studio server, API, page, and main navigation entry from the handover.
- Added Studio to the shared Social tab bar.
- Capped the tab bar at the available width so all tabs can be reached by scrolling on a phone.
- Wrapped draft headers and put dates on their own row on small screens.
- Kept the date input within the card and labeled draft text fields for assistive tools.
- Stopped approval when saving an edit fails.
- Kept the brief when a draft request fails.
- Clarified that approval and Send are separate actions.
- Matched the writing message to the actual eight-minute run limit.

## Checks

- npx tsc --noEmit: passed.
- npm run build: passed on retry, including /social/studio and /api/social/studio. The first attempt stopped at the installed Next.js security notice. No upgrade was run. Existing filesystem tracing warnings remain.
- Targeted ESLint: passed for the Studio files, SocialNav, and regression tests.
- node --test tests/social-studio.test.mjs: 2 tests passed. All webhook calls in these tests were mocked in memory; no external requests were made.
- GET /api/social/studio: 13 skills; Metricool disconnected.
- Browser at exactly 375 CSS pixels: document width 375; no form controls outside the viewport; final tab reachable by horizontal scrolling.
- Browser at 1440 CSS pixels: no page overflow.
- Exercised all 13 skill selectors, brief input, research checkbox, failed Create request, draft edit, date input, Approve, and disabled Send.
- Blank edit was rejected and remained ready. Valid edited text was saved and approved with a future time. Send remained disabled, and the server rejected publishing because no webhook was configured. The QA draft was returned to ready afterward.
- Failed Create was simulated in the browser and preserved the brief.
- Jev returned 0.86 for whether the proposed phone layout changes fit the observed problem. Browser checks determined the final result.

## Live draft reviews

### Instagram carousel

Draft: 8c98dd8e-058b-42b4-a074-ff9ec14cdef9. Reached ready. Read in full.

Six-slide approval checklist for small business owners. A complete test Creative Brief was supplied. The result included a quality gate, labeled hypothetical examples, a save CTA, and explicit Wiki/Social Media.md citations: 1080x1440 canvas, 180px top/bottom, 50px sides with 120px right clearance, hook formula, Problem-Solution structure, three colors, and Anton/Inter. Text-only test; visual compliance and publication approval were not claimed.

### Competitor watch

Draft: 91728f29-5437-409e-a59a-dcb38e006be7. Reached ready. Read in full.

Reviewed Jasper and Copy.ai. Returned dated public LinkedIn post URLs and limited engagement observations. Marked Instagram and full-month coverage unverified. Separated company website evidence from social evidence, and stated that no authenticated tools or paid scrapers were used. Source claims are the draft's reported findings, not an independent audit of every link or count.

### Last 30 days

First draft: eb8077d4-1883-468e-9dd0-24a8fd9bd71a. Failed at the eight-minute timeout with no output. The UI reported: The agent could not finish this draft. Try again.

Bounded retry: 9f58f332-e1ec-4ee0-9051-d2d36b3352b2. Reached ready. Read in full. Returned two Jasper articles dated October 19 and 21, 2026, with URLs and explicit first-party evidence limits. It consulted the last30days instructions but did not run the research engine. This verifies a bounded public-web research draft through the button, not the full last30days engine. The full engine remains unverified after the initial timeout.

## Still blocked

- Full last30days engine completion remains unverified after a broad-topic timeout.
- Make webhook link and a real end-to-end Metricool receipt check.
- Metricool token and brand ID for owned-account analytics, with endpoint documentation checked first.
- ScrapeCreators key or Marcus's permission to use Apify for reliable public Instagram data.
- LinkedIn voice.md remains incomplete.
- Next.js security upgrade is outside this task.

Raw drafts and runtime logs remain local and are not committed. Existing unrelated deletions and AGENTS.md changes are excluded from the Social Studio commit.
