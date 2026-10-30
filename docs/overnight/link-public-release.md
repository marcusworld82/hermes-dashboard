# Owner-confirmed link-public Hermes — October 30, 2026

Owner explicitly confirmed removing the password entirely and allowing anyone with the link to access the information/controls after that exposure was explained. This release removes the app gate, not Vercel team/account protection or provider credentials.

Changes: proxy no longer requires the dashboard cookie; /login and cached /api/auth redirect to /dashboard without reading passwords or minting sessions; logout clears obsolete cookie and returns to dashboard; sign-out button removed; Cutline's separate cookie requirement follows the same public workspace policy. Existing same-origin checks, sync bearer, source HMAC/expiry, server-only provider credentials and storage protections remain. Paid generation is code-locked off; publishing endpoints remain disconnected/blocked. Provider/credential setup mutations remain owner-managed. No secret values or environment credentials changed.

Checks:64 focused tests pass; root/cloud TypeScript and cloud production build pass; scoped lint passes. Cookie-free HTTP checks on the isolated built cloud app: dashboard/social/studio/cutline and both Studio/Cutline status APIs200; legacy login303to dashboard; paid jobs/social publish/render dispatch403; cross-origin write403; missing sync bearer401. No external sends, paid jobs, upload or credentials configuration executed. No unanswered ZIP download action retried.

Release must target only existing project prj_xwfkDLvKKTj9lbwpZtusIF8RJ6y7 and original production alias hermes-dashboard-sandy.vercel.app. Actual deployment/checkpoint recorded outside the commit in ../hermes-no-login-verification.md. If separate Vercel SSO blocks that URL, report it; do not change team/account protection without its own scope approval.
