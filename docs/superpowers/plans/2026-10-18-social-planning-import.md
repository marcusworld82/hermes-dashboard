# Social Planning Import Implementation Plan

> For agentic workers: Use executing-plans to implement this small integration and verify it.

Goal: Show the revised Notion batch as planned dates and readable drafts in Hermes without creating publishing jobs.
Architecture: Read an explicitly imported versioned JSON file from dashboard data. Keep the CRM database and publisher unchanged. Merge planned cards into the existing Social view with clear labels, source links and review notes.
Tech Stack: Existing Next.js 16.4, React, TypeScript, Node built-in filesystem and test runner.
Spec: Marcus requested revising his Notion 14-day plan and then placing it on Hermes's social calendar. Original plan dates are October 19 through November 1, 2026. All items remain drafts pending QC and approval.

## Constraints

No publishing, scheduling, Postiz calls, account changes, or CRM writes. No new dependencies. Preserve unrelated edits. Planned dates are date-only, not invented posting times. Use source IDs for stable identity. New files stay in existing dashboard folders.

## Task 1: Load and validate a planning batch

Files: src/lib/server/social-plan.ts; tests/social-plan.test.ts.
Test missing file returns an empty plan, malformed or duplicate records are rejected clearly, valid dates preserve the exact day, IDs remain stable, captions and source links survive. Run tests before implementation to see failure, implement loader, rerun.

## Task 2: Display planned records

Files: src/app/api/social/route.ts; src/app/social/page.tsx.
Return planning results alongside CRM data. Add planned items to calendar and drafts with date-only labels, source links, review notes and scripts separate from captions. Keep existing publishing records untouched. Typecheck and lint changed files. Verify actual imported count, endpoint readback and visible calendar.

## Task 3: Import and verify

File: data/social-content-plan.json, ignored dashboard data.
Import the final validated export with stable source IDs and needs-review states. Replacing this one batch on the next 14-day revision updates rather than duplicates entries. Read the endpoint and confirm 70 planned social items, no publishing deliveries created. Provide an ICS and JSON copy as portable backups.
