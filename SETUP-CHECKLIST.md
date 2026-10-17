# What Marcus fills in

Everything is built and runs today with agent runs turned off. These are the steps left, in order. The Connections page in the dashboard shows the live status of each one.

## 1. Start it

```bash
cd ~/Desktop/"HERMES DASHBOARD"/app
npm run dev
```

Open http://127.0.0.1:3200. Start the CRM too if you want the CRM page:

```bash
cd ~/Desktop/"Content and Outreach App"/app
npm run dev
```

## 2. Pick the models (already partly done)

- Hermes agents already use your OpenRouter key. Each agent's model is in `~/.hermes/profiles/<agent>/config.yaml`.
- The model choices in your agent package are still marked "recommendations." Confirm them, or change them with `hermes -p <agent> model`.
- Your default Hermes profile ("Marcus Head Agent") uses `typesafe/jev-router`. The dashboard treats the Operator (`rhoperations`) as the head agent. Tell Claude if you want that swapped.

## 3. Turn on agent runs

Settings, then the Agent runs switch. While it is off, nothing is sent to a model and no agent starts, so nothing costs money. Turn it on when you are ready to spend OpenRouter credit.

## 4. Optional direct model bridges

Copy `.env.example` to `.env.local` and fill in only what you want:

- `OPENROUTER_API_KEY` to chat with any OpenRouter model directly (Grok, Kimi and others). Hermes agents do not need this.
- `MUSE_API_KEY`, `MUSE_BASE_URL`, `MUSE_MODEL` from Meta's developer portal for Muse.
- Manus: the bridge is not built yet. It needs a Manus API key and their API docs.

Claude Code and Codex are already found on this Mac and use your subscriptions.

## 5. Phone

- Telegram already works for talking to Hermes.
- To open the dashboard on your iPhone: install Tailscale on the Mac and the iPhone, sign in to both with the same account, then run `tailscale serve 3200`. Put the host name it prints (for example `mymac.tail1234.ts.net`) in `.env.local` as `DASHBOARD_HOSTS=...` and restart the dashboard. The dashboard refuses unknown host names on purpose. Then open the address on the phone, tap Share, then Add to Home Screen.
- The CRM page stays Mac-only on purpose.

## 6. Skills

Your agent package lists skills that are not installed in Hermes yet. The Skills page shows which ones. Upload a skill folder there and press Install, or install from a registry with `hermes skills install <name>`.

## 7. Social

Social reads drafts and the schedule from the CRM. Scheduling and posting stay in the CRM, which holds the Postiz connection. Facebook is not connected in Postiz yet.

## 8. Recast and OpenAdKit

Both open from the dashboard sidebar on your Mac and have a Start button. Recast needs `GOOGLE_API_KEY` in `~/Desktop/Content and Outreach App/integrations/recast/.env.local`, then a restart. OpenAdKit asks for its own AI provider key inside the tool.

## 9. Workflow schedules

Workflows save a "when it runs" note. Automatic scheduling is not switched on yet. Ask Claude to wire it to `hermes cron` once agent runs are on.
