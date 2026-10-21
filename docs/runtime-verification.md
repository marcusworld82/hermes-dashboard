# Hermes runtime verification

The dashboard's ten team profiles all returned the expected connection-check response using their existing configured models. The checks used a fixed prompt with no requested external actions. Sanitized results are in `data/runtime-health.json`.

A real two-step workflow exposed a separate worker failure. The dispatcher launched the bundled Python interpreter with `-m hermes_cli.main` from its isolated task workspace, where the package was unavailable. Direct profile chats still worked because the installed Hermes launcher adds the package path.

The gateway LaunchAgent now sets `HERMES_BIN` to `/Users/oddballgenius/.hermes/hermes-agent/.hermes/bin/hermes`. This uses Hermes's supported executable override instead of changing provider settings or installed Python source. The old plist was backed up to `~/Library/LaunchAgents/ai.hermes.gateway.plist.runtime-backup`. The gateway was restarted when no boards had active workers.

After the change, the first test task completed, its child unlocked automatically, and the child completed. Both test cards were archived and the temporary workflow deleted. Sanitized evidence is in `data/runtime-workflow-check.json`.

## Dashboard changes

- Home input opens a real conversation with the selected lead agent.
- Claude and Codex bridge readiness checks verify subscription login. File existence alone no longer counts as authentication. Direct Codex chat uses a minimal ephemeral session, and both CLI wrappers always send stdin EOF so a prompt cannot hang waiting for piped input.
- The OpenRouter bridge can use the credential already configured in Hermes. It uses existing configured OpenRouter agent models unless explicitly overridden. Harness-only 403 and unavailable-model 404 responses try the next configured model, with the selected model shown in the reply. Authentication and billing errors never trigger that fallback.
- Agent cards distinguish gateway status from the timestamp of a verified reply.
- Kanban supports creating paused cards, assigning an agent, releasing work, and marking completed work with a result.
- Pipeline GET requests no longer complete tasks or save Obsidian notes. The worker POSTs `/api/pipeline/reconcile` to complete internal root cards after every approved child and quality task finishes.
- Workflow runs create the entire paused dependency graph before releasing it. Paused runs can resume without duplicating cards.
- Daily and weekly schedules require an explicit enable setting. Old timing prose never activates work. Slot records and Hermes task idempotency keys prevent duplicate scheduled cards.
- The local supervisor must POST JSON to `/api/workflows/tick` once a minute with the local dashboard Origin header. A missed time catches up once on the same local date.

## Checks

`node --experimental-strip-types --test tests/runtime.test.mjs tests/runtime-cli.test.mjs tests/workflow-schedule.test.mjs tests/workflow-runtime.test.mjs`

Nine focused checks cover profile parsing, Obsidian read-side effects, exact credential lookup, time zones, schedule activation, linked task creation, replay protection, CLI EOF, and direct-model fallback. Typecheck and source lint passed. Generated runtime assets under data require an ESLint ignore.

The running local service uses a production build. Source changes require a fresh build and service restart. The gateway launcher fix already runs independently of that dashboard build.

## Limits

Muse and Manus are still unavailable without their own usable integration and credentials. Installed or enabled MCP entries are configuration evidence, not a successful authenticated request. No posts were published, no external messages were sent, and no Obsidian notes were saved.

A future Hermes gateway service reinstall can regenerate its LaunchAgent. Recheck the trusted `HERMES_BIN` override after that operation if the upstream module-launch issue remains.

## Read-path responsiveness follow-up

Frequent dashboard polls previously launched full Hermes commands for profile lists, board lists, task lists, counts, status and MCP configuration. Concurrent cloud sync and browser polling caused timeouts under rendering load.

These read paths now use local files and read-only SQLite queries. Task listing keeps parameterized filters, archive handling, skills decoding and newest-first order. SQLite reads wait at most 250ms for a lock. Changes and task details still use the Hermes command interface.

Connections now distinguishes a live gateway PID/state check from saved reply tests, each with its original timestamp. Reading this page never claims a new model test occurred. MCP rows say configuration only. Optional app probes and the CRM probe run together with short time limits.

Direct source measurements under load: connections took 2011ms; agent metadata plus task counts took 114ms. These are source measurements, not a claim about the deployed cloud response time.

The existing CRM production build was started using its documented `npm run start` on port 3100. No CRM source or credentials changed. Recast is installed but stopped. OpenAdKit is running, with provider setup unverified. Both remain optional to the Reel workflow.
