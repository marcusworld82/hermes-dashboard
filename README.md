# Hermes Dashboard

Marcus's command center for his Hermes agents. Runs on his Mac at http://127.0.0.1:3200, installable on the iPhone through Tailscale.

```bash
npm install
npm run dev
```

## What is in it

| Page | What it does |
|---|---|
| Home | "What are we creating today?" capture box, pipeline counts, agents, recent work |
| Pipeline | Inbox to Shipped: Capture, Human Gate (approve or reject a plan), Execute, Shipped gallery. Shipped projects are logged to Obsidian. |
| Kanban | Every card on the real Hermes boards, with comments, links and history |
| Chat | Talk to one agent, a group, the head agent (Operator), or a model directly |
| Agents | The eight agents from `~/Desktop/LAZY MONEY AGENTS`, org chart, who you talk to most, groups |
| Workflows | Saved multi-step jobs with templates. A run creates linked Hermes cards. |
| Skills | Installed Hermes skills, package skills not yet installed, upload, install, assign |
| Connections | Live status of Hermes, model keys, bridges, MCP servers, CRM, Obsidian, phone |
| Social | Calendar, drafts and captions read from the CRM |
| CRM | The Studio CRM inside the dashboard. Desktop on this Mac only. |
| Settings | The agent runs switch and where everything lives |

## How it works

- Hermes is the engine. The dashboard calls the `hermes` command line (no shell) for boards, cards, profiles, skills and MCP servers.
- Pipeline cards live on their own Hermes board, `command-center`. Ideas are parked as blocked cards, never in Hermes's triage column, because Hermes auto-splits triage cards and starts agents on them, which would skip the approval gate.
- Approving a plan creates one card per step, linked so each waits for the steps before it, plus a Quality Control check at the end.
- Agent runs are off by default. While off, nothing is sent to a model and no agent starts.
- Dashboard-only data (plans, chats, groups, workflows, settings) is in `data/`, which is not committed.
- Requests that change something must come from the dashboard's own pages (`src/proxy.ts`).

See `SETUP-CHECKLIST.md` for what is left to connect.
