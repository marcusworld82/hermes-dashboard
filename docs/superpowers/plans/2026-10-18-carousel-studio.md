# Carousel Studio and Postiz in Hermes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Carousels page under Social that writes, designs, previews and posts Lyfe with Marcus carousels through Postiz, all inside Hermes.

**Architecture:** Server modules under `src/lib/server/` own Postiz, Higgsfield, Codex images, Claude copy and carousel storage. Pure helpers under `src/lib/carousel/` own the slide model, safe-zone math, templates and banned phrases, and both server and client use them. Slides are drawn to PNG with `next/og` `ImageResponse`, and the preview is the same PNG.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, Tailwind 4, `next/og`, Node 26 `node:test` running `.ts` files directly, `claude -p` and `codex exec` CLIs.

**Spec:** `docs/superpowers/specs/2026-10-18-carousel-studio-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before using any Next API (AGENTS.md).
- Canvas 1080x1440 (3:4) default and 1080x1350 (4:5) "ad-safe". Safe zone: 180px top, 180px bottom, 50px left, 120px right.
- Lyfe with Marcus kit: background #121212, text #F5F0E8, accent #C6F135. Anton for display, Inter for body. Handle "@lyfewithmarcus" bottom-left only. No logo, nothing top-left. Spelled "Lyfe".
- Hook formulas: "Stop doing X", "Nobody tells you X", "How to get X without Y", "I made X, here's what works".
- 7 structures: Listicle, Storytelling, Problem-Solution, Myth vs Truth, Old vs New, Case Study Breakdown, Framework/Matrix.
- Secrets only in `.env.local`: `POSTIZ_API_KEY`, `HF_API_KEY_ID`, `HF_API_KEY_SECRET`. Never returned to the browser.
- Every model call goes through `requireRuns()`. Nothing posts without an explicit Post or Schedule click. Each Higgsfield generation is a single click on a shown quote.
- No em dashes in any generated copy or UI copy.
- Dashboard UI follows `DESIGN.md`.
- State lives in `data/` (gitignored), using `store.ts` for JSON.
- Run tests with: `node --test tests/`

## Review Focus

1. A Postiz schedule call that times out: the post record must say "uncertain" and the UI must block a second submit. (Test in Task 3.)
2. Very long slide text: the font shrinks to fit the safe box, and a slide is flagged if it drops below 28px body or 64px headline. (Test in Task 1.)
3. Claude returns prose or broken JSON: show a plain "try again" error, not a crash, and keep the draft unchanged. (Test in Task 5.)
4. Uploads that aren't JPG, PNG or WebP, or are over 15 MB: rejected with a clear message before anything is written. (Test in Task 4.)
5. Agent runs off: every generate route returns the runs-off message, and the page shows how to turn runs on. (Test in Task 5.)

---

### Task 0: Capture Scorper template looks

**Files:** Create `docs/superpowers/specs/scorper-templates/` (screenshots plus `notes.md`).

- [ ] In Marcus's logged-in Chrome (Claude in Chrome), open dashboard.scorper.ai Carousels. For each mode (Screenshot, Creative, Clone, Photo, Editorial) and each Creative template, screenshot the picker and one generated or preview slide.
- [ ] In `notes.md`, list each template's layout: where the headline sits, body text style, image use, slide-number style, cover vs inner slide differences. No Scorper code or image files go into the app.

### Task 1: Slide model, brand kit, safe-zone layout

**Files:**
- Create: `src/lib/carousel/types.ts`, `src/lib/carousel/brand.ts`, `src/lib/carousel/layout.ts`
- Test: `tests/carousel-layout.test.mjs`

**Interfaces (produces):**
- `types.ts`:
  - `Size = "3:4" | "4:5"`
  - `Mode = "screenshot" | "creative" | "clone" | "photo" | "editorial"`
  - `SlideKind = "cover" | "body" | "cta"`
  - `Slide = { id: string; kind: SlideKind; layout: string; headline: string; body: string; images: string[]; textScale: number; dim: number; showHandle: boolean }`
  - `Carousel = { id, brandId, mode, template, size, theme: "light" | "dark" | "brand", title, inputs: { topic, steer, context, referenceText, includeImages, goal, structure, slideCount, badge: "none" | "blue" | "gold", output: "carousel" | "single" }, hooks: { text: string; formula: string }[], hook: string, slides: Slide[], caption: string, status: "draft" | "scheduled" | "posted", createdAt, updatedAt }`
  - `BrandKit = { id, name, displayName, handle, avatar: string | null, badge, colors: { bg, text, accent }, fonts: { display, body }, ctaText, hashtags: string[] }`
- `brand.ts`: `LYFE: BrandKit`, `getBrandKits(): BrandKit[]`, `saveBrandKit(kit: BrandKit): void` (data file `brand-kits`, seeded with LYFE).
- `layout.ts`:
  - `canvas(size: Size): { w: 1080; h: 1440 | 1350 }`
  - `safeBox(size: Size): { x: 50; y: 180; w: number; h: number }`
  - `fitText(text: string, opts: { box: { w: number; h: number }; maxPx: number; minPx: number; lineHeight: number; charWidth: number }): { px: number; lines: number; fits: boolean }`

- [ ] **Step 1:** Write the tests:
  - `safeBox("3:4")` deep-equals `{ x: 50, y: 180, w: 910, h: 1080 }`.
  - `safeBox("4:5").h === 990`.
  - `fitText` of 20 chars at maxPx 120 returns 120 with `fits: true`.
  - `fitText` of 2,000 chars returns `px === minPx` and `fits: false`.
- [ ] **Step 2:** Run `node --test tests/carousel-layout.test.mjs` and confirm it fails.
- [ ] **Step 3:** Implement. `fitText` steps down 2px at a time, estimating line count from `charWidth * px`.
- [ ] **Step 4:** Run again and confirm it passes.
- [ ] **Step 5:** Commit: "Add carousel slide model and safe-zone layout".

### Task 2: Banned phrases

**Files:**
- Create: `src/lib/carousel/banned.ts`
- Test: `tests/carousel-banned.test.mjs`

**Interfaces (produces):**
- `DEFAULT_BANNED: string[]`. Seed with: delve, crucial, pivotal, robust, seamless, leverage, foster, unlock, navigate, elevate, utilize, game-changer, unlock your potential, let's dive in, here's the thing, let that sink in, in today's fast-paced world, revolutionize, next level, in today's world, let's break this down.
- `findBanned(text: string, list: string[]): string[]`: whole-word, case-insensitive.
- `stripDashes(text: string): string`: replaces an em dash with ", " and an en dash between words with ", ".

- [ ] **Step 1:** Write the tests:
  - `findBanned("We Leverage AI", DEFAULT_BANNED)` deep-equals `["leverage"]`.
  - `findBanned("cleverage", …)` returns `[]`.
  - `stripDashes("fast—cheap")` returns `"fast, cheap"`.
- [ ] **Steps 2–4:** Run (expect fail), implement, run (expect pass).
- [ ] **Step 5:** Commit.

### Task 3: Postiz in Hermes

**Files:**
- Create: `src/lib/server/postiz.ts`, ported from `~/Desktop/Content and Outreach App/app/src/lib/social-postiz.ts` with these changes:
  - Drop `isDemo` and the encrypted credential store.
  - Key comes from `process.env.POSTIZ_API_KEY`.
  - Keep every other check.
  - Keep `parsePostizChannels` from `postiz-cloud.ts`.
- Create: `src/lib/server/social-posts.ts` (post records, data file `social-posts`)
- Create routes:
  - `src/app/api/social/postiz/channels/route.ts` (GET)
  - `src/app/api/social/postiz/posts/route.ts` (GET `?start&end`)
  - `src/app/api/social/postiz/schedule/route.ts` (POST)
  - `src/app/api/social/postiz/cancel/route.ts` (POST)
- Modify: `src/app/api/social/route.ts` (merge Postiz posts for the visible month into `posts`), `src/lib/server/connections.ts` (Postiz check uses the env key and a channels call).
- Test: `tests/postiz.test.mjs`

**Interfaces (produces):**
- `PostizClient` (channels, upload, schedule, cancel, posts), `postingPayload(...)`, `validatePostMedia(...)`, `postizClient(): PostizClient` (throws "Add POSTIZ_API_KEY to .env.local" when missing).
- `social-posts.ts`:
  - `PostRecord = { id, carouselId, channelIds: string[], when: string, caption, media: string[], state: "submitting" | "scheduled" | "uncertain" | "failed" | "canceled", postizIds: string[], error: string | null, overrideReason: string | null }`
  - `schedulePost(input, client = postizClient()): Promise<PostRecord>`. It writes a "submitting" record before uploading. It uploads each PNG once and reuses the media for every channel. It calls `schedule` per channel. A `PostizError` with `uncertain: true` sets the state to "uncertain".
  - `blockIfPending(carouselId): void` throws "This carousel has a post in progress or unconfirmed. Check Postiz before trying again." when any record for that carousel is "submitting" or "uncertain".

- [ ] **Step 1:** Write the tests, using a fake transport:
  - `postingPayload` for Instagram with 3 media gives `settings.post_type === "post"`, and the first value has 3 images.
  - `validatePostMedia("instagram", [])` throws.
  - With a fake client whose `schedule` throws `new PostizError("x", true)`, the stored record's state is "uncertain", and a second `schedulePost` for the same carousel throws the `blockIfPending` message.
  - The record file contains a "submitting" entry before the fake `upload` is called (the fake checks the file).
- [ ] **Steps 2–4:** Run (expect fail), implement, run (expect pass).
- [ ] **Step 5:** Commit.

### Task 4: Carousel storage and media uploads

**Files:**
- Create: `src/lib/server/carousels.ts`, and routes:
  - `src/app/api/social/carousels/route.ts` (GET list, POST create)
  - `src/app/api/social/carousels/[id]/route.ts` (GET, PATCH, DELETE)
  - `src/app/api/social/media/route.ts` (POST upload, GET list)
  - `src/app/api/social/media/[file]/route.ts` (GET bytes)
- Test: `tests/carousels.test.mjs`

**Interfaces (produces):**
- `listCarousels(): Carousel[]` (newest first)
- `getCarousel(id): Carousel`
- `createCarousel(partial): Carousel` (defaults: LYFE, mode "screenshot", size "3:4", theme "dark", slideCount 7, output "carousel", badge "none")
- `updateCarousel(id, patch): Carousel`
- `deleteCarousel(id)`
- `saveMedia(bytes: Buffer, mime: string, name: string): { file: string }`. Stores in `data/social-media/`. Allows only `image/jpeg`, `image/png`, `image/webp`, up to 15 MB, and checks magic bytes against the mime type.
- `readMedia(file): { bytes, mime }`. Rejects any name not matching `^[a-z0-9_-]+\.(png|jpg|webp)$`.

- [ ] **Step 1:** Write the tests:
  - Create, update, list round-trip, using `paths.data` pointed at a temp dir through the `HERMES_DATA_DIR` env var (add this override to `paths.ts`).
  - `saveMedia` with a GIF mime throws "Use JPG, PNG or WebP".
  - A 16 MB buffer throws "Images must be 15 MB or smaller".
  - `readMedia("../x.png")` throws.
- [ ] **Steps 2–4:** Run (expect fail), implement, run (expect pass).
- [ ] **Step 5:** Commit.

### Task 5: Claude copy generation

**Files:**
- Create: `src/lib/server/carousel-ai.ts`, `src/app/api/social/carousels/[id]/generate/route.ts` (POST `{ step: "ideas" | "news" | "hooks" | "slides" | "slide" | "caption", index? }`), `src/lib/server/reference.ts`
- Test: `tests/carousel-ai.test.mjs`

**Interfaces (produces):**
- `parseJsonReply<T>(raw: string): T`. Takes the first `{...}` or `[...]` block. Throws "Claude's answer couldn't be read. Try again." when nothing parses.
- `generate(step, carousel, opts, send = claudeSend): Promise<Partial<Carousel> | { ideas: string[] } | { news: { title: string; url: string; summary: string }[] }>`.
  - Calls `requireRuns()` first.
  - The prompt includes: the brand foundation note text (from `paths.vault` at `AI Brain/2026-10-16-marcus-personal-brand-foundation.md`, skipped if missing), the hook formulas, the 7 structures, the safe-zone character budget per slide (from `fitText` at 64px minimum headline), and the banned list.
  - After parsing, it applies `stripDashes`. If `findBanned` returns anything, it does one rewrite call naming the words. Leftover words are returned in `flags`.
- `claudeSend(prompt): Promise<string>`: exported from `models.ts` (the existing Claude def's `send`).
- `reference.ts`:
  - `fetchReference(url): Promise<string>`: https only, 2 MB cap, 10s timeout, HTML stripped to text, capped at 20,000 chars.
  - `fileToText(bytes, mime)`: supports txt, md and pdf. For pdf, use `pdftotext` if present, otherwise reject with "PDF reading isn't available on this Mac".

- [ ] **Step 1:** Write the tests, using a fake `send`:
  - `parseJsonReply("Sure! ```json\n{\"a\":1}\n```")` deep-equals `{ a: 1 }`.
  - `parseJsonReply("no")` throws the exact message above.
  - `generate("hooks", …)` with a fake send returning a hook containing "leverage" calls send twice.
  - With agent runs off (settings file `agentRuns: false`), `generate` rejects with `RunsOffError`.
- [ ] **Steps 2–4:** Run (expect fail), implement, run (expect pass).
- [ ] **Step 5:** Commit.

### Task 6: Slide renderer and templates

**Files:**
- Create: `assets/fonts/Anton-Regular.ttf`, `assets/fonts/Inter-Regular.ttf`, `assets/fonts/Inter-SemiBold.ttf` (download from Google Fonts' GitHub, OFL)
- Create: `src/lib/carousel/templates/index.tsx`, with one file per family: `screenshot.tsx`, `photo.tsx` (split, single, hook, before-after, started-going), `editorial.tsx` (cover, story), `creative/*.tsx` (one per Scorper template captured in Task 0), `clone.tsx`
- Create: `src/lib/server/render.tsx`, `src/app/api/social/carousels/[id]/slides/[n]/route.ts` (GET PNG), `src/app/api/social/render/route.ts` (POST `{ carousel, index }` for unsaved preview), `src/app/api/social/carousels/[id]/zip/route.ts`
- Test: `tests/render.test.mjs`

**Interfaces (produces):**
- `TemplateDef = { id: string; mode: Mode; name: string; layouts: string[]; render(slide: Slide, ctx: { kit: BrandKit; size: Size; theme; index: number; total: number; images: Record<string, string> }): ReactElement }`
- `TEMPLATES: TemplateDef[]`
- `renderSlide(carousel, index): Promise<{ png: Buffer; flags: string[] }>`. Flags include "text shrunk below readable size" from `fitText`. Images are passed as data URLs read through `readMedia`.
- Every template keeps text inside `safeBox`. The handle is drawn bottom-left, inside the safe zone, when `showHandle` is on.
- Zip: store-only ZIP built in-process (no new dependency).

- [ ] **Step 1:** Write the tests:
  - For every template and layout, `renderSlide` on a sample carousel returns a PNG whose IHDR width is 1080 and height is 1440, or 1350 for size "4:5".
  - A slide with 2,000 chars of body returns the shrink flag.
- [ ] **Steps 2–4:** Run (expect fail), implement, run (expect pass).
- [ ] **Step 5:** Commit.

### Task 7: Images: Codex default and Higgsfield option

**Files:**
- Create: `src/lib/server/images-codex.ts`, `src/lib/server/higgsfield.ts`, `src/app/api/social/images/route.ts` (POST `{ carouselId, slideIndex, provider: "codex" | "higgsfield", model?, prompt, quoteId? }`), `src/app/api/social/images/quote/route.ts` (POST)
- Modify: `src/lib/server/connections.ts` (Higgsfield key check)
- Test: `tests/images.test.mjs`

**Interfaces (produces):**
- `generateWithCodex(prompt: string, size: Size, run = execCodex): Promise<{ file: string }>`.
  - Runs `codex exec --json --skip-git-repo-check --sandbox read-only` with a prompt that asks for one image, the aspect ratio, and empty space inside the text area.
  - Finds `session_id` (thread id) in the JSONL, takes the newest PNG in `~/.codex/generated_images/<id>/`, and saves it through `saveMedia`.
  - Throws "Codex didn't return an image." if none is found.
- `hfAuth(): string` (from `HF_API_KEY_ID`/`HF_API_KEY_SECRET`, or throws "Add HF_API_KEY_ID and HF_API_KEY_SECRET to .env.local")
- `quote(model, input, fetcher = fetch): Promise<{ quoteId; credits: number | null; usd: number | null; description: string | null }>`. Calls POST `https://api.higgsfield.ai/estimate/<model>`. The quote is stored for 10 minutes.
- `generateWithHiggsfield(quoteId, fetcher = fetch): Promise<{ file }>`.
  - Only runs with a fresh quote, and the quote is used once.
  - Saves the request ID before polling (2s rising to 10s, 5 minute cap).
  - Never retries the POST.
- Both run `requireRuns()`.
- The images route returns 409 with "Approve the quote first" when provider is higgsfield and there's no valid `quoteId`.

- [ ] **Step 1:** Write the tests, with fake exec and fake fetch:
  - Codex JSONL containing a thread id plus a temp generated_images folder returns a saved file.
  - The quote parses `{credits: 2, usd: 0.04}`.
  - `generateWithHiggsfield` with an unknown quote throws.
  - A fake fetch whose submit POST returns 500 is called exactly once.
- [ ] **Steps 2–4:** Run (expect fail), implement, run (expect pass).
- [ ] **Step 5:** Commit.

### Task 8: Carousels page, post step, history

**Files:**
- Create: `src/app/social/carousels/page.tsx`, `src/app/social/history/page.tsx`, `src/components/social/` (SocialNav, StepBar, ModeChips, TopicStep, HookStep, ReviewStep, PostStep, PreviewPanel, ImagePanel, BannedList)
- Modify: `src/app/social/page.tsx` (add SocialNav: Calendar, Drafts, Carousels, History)

Behavior pinned by the spec:
- Layout: brand switcher on top, StepBar (Topic, Hook, Review, Post), ModeChips, form, and a PreviewPanel that is `sticky` on desktop and stacks above the form on phones.
- Preview: Light, Dark and Brand toggle. Arrows move between slides. The image source is `/api/social/render`, debounced 400ms.
- Topic step:
  - Title field.
  - Topic ideas: 6, with refresh and a steer box.
  - In the news: 3 items with source links.
  - Extra context and reference (link or file).
  - Include images switch.
  - Template gallery (Creative), uploads (Clone: 1 cover plus up to 3 inner), or layout picker (Photo, Editorial).
  - Advanced: carousel or single, text size, badge, slide count 3 to 10, size 3:4 or 4:5, goal (reach, trust, saves, sales, DMs), structure (the 7).
- Hook step: 5 hooks, each showing its formula. Pick one, then Write slides.
- Review step:
  - Slide strip with drag reorder, delete, duplicate, regenerate, and inline edit.
  - ImagePanel per slide: Upload, Library, Generate. The provider picker defaults to "GPT Image (ChatGPT plan), included in your plan". Higgsfield shows its live quote and a "Generate for $X" button.
  - Checklist: size, safe zone, hook formula, structure, 3 colors, 2 fonts, banned phrases, CTA vs goal. "Post anyway" asks for a reason.
- Post step: caption editor, channel checkboxes from Postiz, Post now or Schedule (local date and time). Shows the receipt or the error. "Uncertain" shows "Check Postiz before trying again" and hides the submit button. Also has Download ZIP.
- History: list of carousels with status and open, duplicate, and delete.
- When agent runs are off, the generate buttons show the runs-off note with a link to Settings.

- [ ] **Step 1:** Run `npm run typecheck` and `npm run lint` until both are clean.
- [ ] **Step 2:** Commit.

### Task 9: CRM posting switch

**Files:** Modify the CRM (`~/Desktop/Content and Outreach App/app`): add setting `SOCIAL_POSTING_DISABLED`, read in `src/app/social/actions.ts` before any schedule, which throws "Posting moved to Hermes." The CRM Social page shows a banner linking to `http://127.0.0.1:3200/social/carousels`.

- [ ] Add the switch, default **off**. Marcus turns it on after the first real Hermes post (per spec). Run the CRM's own tests. Commit in the CRM repo.

### Task 10: Verify

- [ ] Run `node --test tests/`, `npm run typecheck` and `npm run lint`. All must pass.
- [ ] Start the dev server (port 3200). In the browser pane, check:
  - A Screenshot carousel goes through all 4 steps with agent runs on.
  - Each template renders.
  - Preview matches the downloaded PNG.
  - The phone width layout works.
  - The Post step lists channels (if `POSTIZ_API_KEY` is set), but nothing is posted without Marcus.
