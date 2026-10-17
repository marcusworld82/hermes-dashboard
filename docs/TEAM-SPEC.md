# Marcus's Agent Team (spec v2, from the October 17 interview)

Replaces the 8-agent Lazy Money package. Main brand: **Lyfe with Marcus** (personal brand, Instagram first). Source of truth for the brand: `second-brain/AI Brain/2026-10-16-marcus-personal-brand-foundation.md`.

## Hierarchy

```
                          Marcus
                            |
                 Jordan (head agent, COO)
                            |
   +-------+-------+-------+-------+-------+-------+-------+-------+
   Maya    Kai     Rico    Grant   Nash    Sage    Lux     Coco
  Social  Builder  Lead    Finance Trading Music   Creative Fashion
                   Gen                     artist  Director
                                                     |
                                   writer, image director, video director,
                                   sound, checker (Lux's helpers)

   Quinn (QA) checks every deliverable before anything reaches Marcus.
```

- Everyone reports to Jordan. Marcus can still message any agent directly.
- Quinn sits outside the chain on purpose. Quinn's fail cannot be overruled by another agent.
- Only one thing always waits for Marcus: **spending money** (paid generations, ads, tools).

## Groups

| Group | Members | Lead |
|---|---|---|
| Content Team | Maya, Lux, Quinn | Maya |
| Build Team | Kai, Quinn | Kai |
| Sales Team | Rico, Maya, Jordan | Jordan |
| Brand Team | Coco, Lux, Maya, Sage | Lux |

## The agents

| Name | Role | Thinks with | Hands writing to | Tools to connect | Skills |
|---|---|---|---|---|---|
| **Jordan** | Head agent. Plans, delegates, tracks, sends the morning brief and urgent pings on Telegram | Codex gpt-6-sol | Claude desk for big plans | Kanban, Telegram, Obsidian | typesafe-ai, archify, token-efficient-agent-workflow, follow-up-email-writer, task-observer |
| **Maya** | Social media: content, scripts, captions, scheduling, DMs, comments, competitor watch | Free: thinkingmachines/inkling | Claude desk for scripts and captions | Instagram, Postiz, Recast | ig-plan, ig-caption, ig-reel, ig-carousel, ig-story, ig-dm, ig-reply, ig-comment, ig-viral, ig-repurpose, content-psychology-engine, content-repurposing, competitor-social-research, social-media-research, trend-discovery, outlier-post-finder, comment-mining, reel-scripter, content-strategist-system |
| **Kai** | Builder: websites, web apps, dashboards, platforms | Codex gpt-6-sol | none | GitHub, Vercel, Supabase | 3d-site-builder, frontend-design*, impeccable, framer, framer-code-components, gsap-react, gsap-scrolltrigger, scroll-craft, composio-cli, token-efficient-agent-workflow |
| **Rico** | Lead gen and sales: finds and qualifies leads, drafts outreach, follows up | Codex gpt-6-luna | Claude desk for outreach copy | CRM (Studio), email, Smartlead, lead finders | icp-onboarding, list-builder, google-maps-list-builder, blitz-list-builder, prospeo-search-api, cold-email-kickoff, cold-email-weekly-rhythm, follow-up-email-writer, campaign-strategy, campaign-copywriting, spam-word-checker, positive-reply-scoring, smartlead-api, influencer-prospecting, offer-and-bio-writer |
| **Grant** | Finance: costs, invoices, what's owed, what's earned | Free: nvidia/nemotron-3.5-lightning | none | Stripe (read only), spreadsheets | xlsx*, typesafe-ai |
| **Nash** | Trading: NAS100 futures premarket brief from Marcus's rules. Never places trades | Free: nvidia/nemotron-3-super-120b-a12b | none | Market data feed, economic calendar | typesafe-ai |
| **Sage** | Music artist manager for Treasure: releases, identity, content, analytics | Free: google/gemma-4-31b-it | Claude desk | Treasure analytics exports | reel-director, content-psychology-engine, ig-plan, ig-caption, video-director, voice-director, brand-voice-guardian |
| **Lux** | Creative Director: images, video, editing. Runs the Creative Director project and its five helpers | Codex gpt-6-sol | Claude desk for prompts and scripts | Higgsfield, Recast, HyperFrames, InVideo | creative-director, image-director, video-director, ai-image, ai-video, higgsfield-api, hyperframes, reel-director, storyboard-standard, image-quality-standard, marcus-carousel-director, kinetic-caption-director, lwm-split-edit, lwm-talking-head-short |
| **Coco** | Fashion designer for COAD and Zamari | Free: google/gemma-4-31b-it | Claude desk | Image generation (through Lux) | fashion-streetwear-trends*, creative-director-brain*, image-director, ai-image, brand-carousel-prompts |
| **Quinn** | QA: checks everything against rules, brand kit, voice and platform specs before it reaches Marcus | Codex gpt-6-sol | Claude desk for voice checks | Read-only access to all outputs | image-quality-standard, brand-voice-guardian, build-vs-reference-audit, spam-word-checker, humanizer* |

\* Lives in a Claude plugin folder, not `~/.claude/skills`. Needs copying from the plugin cache.

"Claude desk" means the agent sends that one job to Claude Code on this Mac (`claude -p`), which uses Marcus's Claude plan the allowed way. Hermes itself never holds the Claude login.

## Knowledge each agent loads

- **All creators** (Maya, Lux, Sage, Coco, Quinn): the Lyfe with Marcus foundation, `Wiki/Social Media.md` specs, and the brand kit for whichever brand the job is for.
- **Lux:** `~/Desktop/@GOALS/MY AGENTS/CREATIVE DIRECTOR/creative-director-project` (AGENTS.md, numbered video styles, helper roles).
- **Coco:** COAD and Zamari brand notes.
- **Sage:** Treasure intake in the Creative Director project.
- **Nash:** Marcus's NAS100 indicator rules (still to be supplied).

## Still open

- Nash needs Marcus's written trading rules and a market data source.
- Brand kits for COAD and Zamari need locating or creating.
- Reveal House drops out of the creative focus. Its old instructions stay archived in `~/Desktop/LAZY MONEY AGENTS`.
- Approvals: Marcus chose only spending money. The CRM still requires approval for every email by its own design, and Quinn checks everything before it goes out.
