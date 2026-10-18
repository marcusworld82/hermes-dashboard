# Carousel Studio and Postiz in Hermes

Date: 2026-10-18. Owner: Marcus. Status: draft for approval. Marcus's answers of 2026-10-18 applied.

## Why

Marcus wants Scorper's carousel workflow (shown in his Loom of 2026-10-18) inside the Hermes dashboard, in his own brand, with posting through Postiz from Hermes itself. Today the Social tab only reads drafts from the CRM, and only the CRM can post. Scorper charges per credit, posts generic-looking output, and can't use Marcus's brand rules, skills or agents. Hermes can.

Success: Marcus types a topic in Hermes, picks a hook, edits slides with a live preview, and schedules the finished carousel to Instagram (and other Postiz channels) without leaving Hermes. Output follows `Wiki/Social Media.md` and the brand kit without him checking by hand.

## Goals

1. Postiz runs from Hermes: connect with an API key, list channels, upload slides, post now or schedule, cancel, and show scheduled posts on the existing Social calendar.
2. A Carousels page under Social with every carousel feature from the Loom:
   - 4 steps: Topic, Hook, Review, Post.
   - 5 modes: Screenshot, Creative, Clone, Photo, Editorial.
   - Topic ideas (refresh, plus a "steer" box), In the news, extra context, include images, reference link or file.
   - Advanced: carousel or single post, text size, verified badge (none, blue, gold), slide count.
   - Light, Dark and Brand preview, pinned on the right while the form scrolls.
   - Brand kits, a custom CTA slide, and History.
3. Copy that sounds like Marcus: written by Claude through the existing Claude desk bridge, using his hook formulas and carousel structures, with a banned-phrase list applied before anything renders.

## Non-goals (later projects)

Video templates, Stories, Single Posts wall, For You feed, Telegram agent, Brand Brain (learning from his Instagram), analytics.

## Anti-goals (a failure even if it works)

- Anything posts without Marcus clicking Post or Schedule.
- Any paid generation runs without Marcus approving that specific spend (TEAM-SPEC rule). ChatGPT-plan images are not a per-image spend, but Higgsfield images are.
- Slides look like stock Scorper output instead of his brand.
- Lifting Scorper's code or image files. Their template layouts are rebuilt from scratch to match the look (Marcus's call, see Creative below).
- Two places able to post at once. Once the Hermes composer works, CRM posting is turned off (Marcus's call).

## Constraints

- App: `app/` (Next.js 16.4, React 19.3, Tailwind 4), branch `feature/command-center`. Read `node_modules/next/dist/docs/` before using Next APIs (AGENTS.md).
- Dashboard style follows `DESIGN.md` (light, Outfit, soft cards). Slide style follows the brand kit, not the dashboard.
- Model calls go through `src/lib/server/models.ts` (Claude via `claude -p` on this Mac) and respect `requireRuns()`: when Agent runs are off, generation buttons explain that instead of calling a model.
- State lives in `data/` (gitignored), using `store.ts` for JSON and plain files for images.
- Secrets live in `.env.local` (gitignored), never in `data/` or the browser.
- Slide specs come from `~/Documents/second-brain/Wiki/Social Media.md`:
  - Carousel canvas 1080x1440 (3:4).
  - Safe zone: 180px top and bottom, 50px left, 120px right.
  - One display font and one body font, 3-color rule, approved hook formulas, the 7 carousel structures.
  - An "ad-safe" size of 1080x1350 (4:5) is offered as a toggle, because Instagram can't boost 3:4 posts.
- Lyfe with Marcus kit (from `Wiki/Lyfe with Marcus Brand and Content System.md`):
  - Background #121212, text #F5F0E8, accent #C6F135.
  - Anton headlines, Inter body.
  - Handle @lyfewithmarcus bottom-left only, no logo, nothing top-left.

## How it works

### Postiz in Hermes

- New `src/lib/server/postiz.ts`, ported from the CRM's `src/lib/social-postiz.ts` and keeping its safety rules:
  - Response size caps, ID checks, and media rules (up to 10 images, JPG/PNG/WebP, or one MP4).
  - The "uncertain, don't resubmit" error, and a check that a receipt matches the post sent.
- Key: `POSTIZ_API_KEY` in `.env.local`. Settings and Connections show whether it's set and whether Postiz accepted it. The key is never sent to the browser.
- Routes under `/api/social/postiz/`:
  - `channels`, `upload`, `schedule`, `cancel`, `posts?start&end`.
  - Writes require the dashboard's existing same-origin protection.
- A post record is saved in `data/social-posts.json` before calling Postiz, then updated with the Postiz post ID or the error, so a timeout can't cause a silent double post.
- The Social calendar merges Postiz posts with the existing CRM and Notion entries. CRM reading stays as is.

### Carousel data

- `data/carousels/<id>.json` holds: brand, mode, template, size, title, topic inputs, hooks offered, chosen hook, slides, caption, status (draft, scheduled, posted) and history.
- Each slide holds: kind (cover, body, CTA), text fields, image refs, and per-slide settings (text size, dim, position).
- Uploaded images go in `data/social-media/<id>/`.
- Brand kits live in `data/brand-kits.json`. Only Lyfe with Marcus for now (Marcus's call); the structure allows more later. Each kit has:
  - Name, handle, display name, avatar image, and verified badge.
  - 3 colors, display font, body font.
  - Default CTA slide text, and default hashtags for captions.

### Rendering

- Slides are drawn on the server to PNG with `next/og` `ImageResponse` (already part of Next, no new dependency).
- The live preview is the same render shown as an image, refreshed shortly after typing stops. What Marcus previews is exactly what gets posted.
- Fonts: Anton and Inter TTF files committed under `app/assets/fonts/` (both OFL). Other brands add their own.
- Every template draws inside the safe zone. A shared helper does the box math and shrinks text that would overflow, and the Review step flags any slide where text had to shrink below a readable size.
- Export: post directly, or download a ZIP of PNGs.

### Copy generation (Claude desk)

- One server module builds prompts and parses JSON replies. Calls:
  1. Topic ideas: 6 ideas from the brand foundation note, plus the steer text.
  2. In the news: 3 recent items for the brand's niche. Claude desk may use web search. Each item shows a source link.
  3. Hooks: 5 hooks, each tagged with which approved formula it uses.
  4. Slides: full slide copy for the chosen hook, structure and slide count, using extra context and reference text.
  5. Regenerate one slide.
  6. Caption: long-form, double-spaced, 3 hashtags.
- Reference: a link is fetched on the server (text only, size-capped). PDF, TXT and DOCX uploads are converted to text.
- Banned phrases: `data/banned-phrases.json`, seeded from Marcus's CLAUDE.md word list and common AI tells. Marcus can edit it in the page.
  - After every generation, banned phrases are checked.
  - If any are found, Claude gets one rewrite attempt.
  - Anything still left is highlighted in Review.
  - Em dashes are always removed.

### The five modes

- **Screenshot:** tweet-style slide with avatar, name, handle, optional badge and text. Light, Dark or Brand background.
- **Creative:** Marcus's call: start with Scorper's template looks (Moola, Sketch, Bookworm, Flex, Brock, Printo, Matcha and the rest shown in his dashboard). Each is rebuilt from scratch from screenshots of his logged-in Scorper account, then drawn in the Lyfe with Marcus kit. Our own templates come later.
- **Clone:**
  - Marcus uploads 1 cover image and up to 3 inner slides he likes.
  - Claude (reading the images) returns a style spec: layout, colors, font pairing (picked from the brand's allowed fonts), text positions.
  - The spec is saved as a reusable "cloned template" and drawn by a general-purpose template.
- **Photo:** Split, Single, Hook, Before/After, and Started vs Going. Each slide takes one or two photos, with text size and dim sliders and "show my handle". Photos come from uploads or the media library.
- **Editorial:** Cover (headline, main photo, circle inset, brand badge) and Story (body slides in the same look).

### Include images

Marcus's call (updated 2026-10-18): images can be generated, with two routes. His own uploads always work too.

**Default: ChatGPT plan through Codex (GPT Image).**
- Hermes runs `codex exec` on this Mac, the same way the existing Codex bridge in `models.ts` does. Codex's built-in `image_gen` tool makes the image using Marcus's ChatGPT subscription, with no API key and no per-image charge.
- Codex saves images under `~/.codex/generated_images/<session>/`. Hermes reads the session ID from `codex exec --json`, copies the new PNG into `data/social-media/<carousel id>/`, and attaches it to the slide.
- The price label reads "Included in your ChatGPT plan". Plan usage limits still apply, and a limit error is shown plainly.
- Hermes asks for the slide's size (3:4 or 4:5) and tells Codex to leave room for text in the safe zone. Codex can't confirm which GPT Image version it uses, so the UI doesn't name a version.

**Optional: Higgsfield (paid, per image).**
- Keys `HF_API_KEY_ID` and `HF_API_KEY_SECRET` in `.env.local`, sent as `Authorization: Key ID:SECRET` to `https://api.higgsfield.ai`. These are the same names the `higgsfield-api` skill uses. The keys are never sent to the browser.
- Before every Higgsfield run, Hermes calls `POST /estimate/<model>` with the exact request. It shows credits and USD per image and the total for the selected slides. Nothing generates until Marcus clicks Generate on that quote, and each click is one approved spend.
- If Higgsfield returns a text price description instead of a number, that text is shown as is and labeled "not an exact quote".
- No balance is shown, because Higgsfield has no public balance endpoint.
- Generation POSTs are never retried automatically. Hermes saves the request ID first, then polls for the result.

**Where it shows up**
- An "Include images" switch on the Topic step. Per slide in Review: "Generate image" with a model picker (GPT Image via ChatGPT plan by default, then the Higgsfield models Marcus enables), plus Upload and Media library.
- Agent runs must be on, the same as text generation.

### Review step and quality gate

- Slide strip: reorder, delete, duplicate, regenerate one slide, and edit text in place.
- Automatic checks, shown as a checklist before Post is enabled:
  - Size and safe zone.
  - Hook matches a formula.
  - Structure matches one of the 7.
  - No more than 3 colors and 2 fonts.
  - No banned phrases.
  - CTA matches the chosen goal (reach, trust, saves, sales, DMs).
- Marcus can post anyway, but the reason is recorded on the post.

### Post step

- Caption editor (prefilled), channel picker (from Postiz), then Post now or Schedule (date and time in his timezone).
- Shows the receipt and adds the post to the calendar.
- AI-made images are labeled where the platform asks (TikTok "made with AI").

### Pages and layout

- The `/social` header gets a sub-nav: Calendar, Drafts, Carousels, History. Later projects add Video and the rest.
- `/social/carousels`: brand switcher at the top, steps bar, mode chips, form in the middle, preview pinned on the right.
- On phones, the preview sits above the form and collapses.

## Left to the builder

File names, component split, prompt wording, the exact look of the 6 Creative templates (inside the brand kit and safe-zone rules), and test layout. Add tests for the safe-zone math, the banned-phrase filter, the Postiz payload builder, and the post record written before the Postiz call.

### Turning off CRM posting

After Hermes has posted one real carousel end to end, the CRM's schedule and post actions are switched off (a setting in the CRM, not deleted code) and its Social page points to Hermes. The CRM keeps showing its history.

## Open questions for Marcus

None. Which Higgsfield image models to list is left to the builder, starting with the ones Marcus already uses in Higgsfield.
