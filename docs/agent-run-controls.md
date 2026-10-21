# Agent run controls

Each agent's editor now has a separate Dashboard run controls panel. Preview shows the exact change before saving. A SQLite transaction stores the new policy and prior values in an audit record. Revert is allowed only for the latest unchanged save. Profile edits retain their existing CLI, backup and diff flow.

Pause prevents new dashboard dispatches for that agent. It does not kill existing processes, recall cards already released to Hermes, stop a separately running gateway, or control external CLI calls. Turning pause off does not resume old jobs automatically.

The daily USD cap applies to dashboard API work, with days measured in America/New_York. Blank means no cap. Zero blocks API and unknown-billing calls. A runner with no enforceable provider maximum cannot run under a finite cap. This includes current Hermes profile chat and asynchronous board dispatch. They can run with no cap, but their cost is explicitly unreported.

Reservations use SQLite BEGIN IMMEDIATE, shared across workers. Known actual API costs replace reservations. Missing cost, timeouts and failed runs keep the full reserved amount. Unknown unbounded work already recorded that day blocks later capped work. Running reservations carry across midnight. Stopped or crashed runs remain conservatively reserved until reviewed; no automatic cost reconciliation is implemented.

Claude desk calls and finder rounds use a $1 CLI maximum per call. Authentication is inspected with API routing overrides removed. Only a verified claude.ai authentication result is classified as subscription. Subscription runs consume the user's plan allowance, not the API USD budget. Their reported API-equivalent cost is not treated as a cash charge. Unrecognized authentication is classified as unknown and retains the full reservation.

Attribution: profile chats and board dispatch use the assigned profile; unassigned board cards use Jordan. Rico owns finder, outreach kits and rewrites. Maya owns carousel and Content Machine copy. Lux owns campaign-kit copy. Direct model chats are tracked under their model bridge IDs, not falsely attributed to a team member. Morning stages supply their agent ID or use the same reservation interface.

Home's agent activity API adds `activity.control` with pause, cap, known USD, retained reservations, unknown-cost run count, subscription run count and dashboard run timestamps. `activity.lastMessages` contains up to five saved agent chat replies, with millisecond timestamps and thread IDs. Board activity remains its existing independent evidence. This ledger is dashboard-only and is not a full Hermes or provider invoice.

No live model calls were made to implement or test these controls. Tests use isolated SQLite databases and fake CLI executables.
