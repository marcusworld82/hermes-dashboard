> Canonical source: https://github.com/marcusworld82/hermes-dashboard, branch `main`.
> Vercel production root: `cloud`. The old sibling cloud directory is a legacy local copy.

# Marcus OS cloud and local hosting

Online URL: https://hermes-dashboard-sandy.vercel.app

Vercel project: `prj_xwfkDLvKKTj9lbwpZtusIF8RJ6y7`, team `had2work925-gmailcoms-projects`.

The canonical online build lives inside this repository in `cloud/`. It contains the UI, authentication and cloud gateway, not the local CLI code or raw Mac data files. `src/app/api` in that build contains the gateway rather than the original local API handlers. The local app and data remain authoritative. Do not deploy the local app directory as the cloud app.

## Access and secrets

Private password: `~/Library/Application Support/Hermes Dashboard/Cloud Login.txt`.
Session signing and bridge secrets: `cloud-access.json` in that same folder, mode 600.
Server-only variables in Vercel: HERMES_PASSWORD_HASH, HERMES_SESSION_SECRET, HERMES_BRIDGE_KEY and Blob credentials. No password or bridge secret is in the client bundle. Rotating the session secret signs out all devices.

Cloud access uses an HttpOnly, Secure, SameSite=Strict cookie with a seven-day expiry. Sign out uses POST with same-origin checks. API mutation requests retain origin checks. Private Blob storage stores the current relay address and saved API views, including calendar, plans and chat summaries. Cloud data is still private business data, not anonymous demo content.

## What stays on the Mac

Hermes commands, agent/model execution, Obsidian writes, the original local database and local software. Existing approval gates and the agent-runs switch still apply. CRM, Recast and OpenAdKit embedded interfaces remain explicitly local-only. Do not expose their raw ports.

The Vercel UI accesses live local API routes through a separate bearer-authenticated relay on loopback port 3202 and an outbound Cloudflare quick tunnel. The relay cannot serve arbitrary files or proxy arbitrary hosts. Vercel accepts only the expected tunnel hostname pattern and never follows redirects.

## Offline behavior

Synced views remain readable when the Mac is offline. A visible status bar shows connectivity and last saved time. Views not previously synced require reconnecting the Mac. Changes and executions require the live Mac; arbitrary actions are not queued. If a dispatched write loses its connection, its outcome is unknown and it is not automatically retried.

The bridge refreshes changed views about every two minutes. It registers a changed tunnel address in private Blob automatically, without redeploying Vercel. A write also requests an earlier sync. Cloudflare quick tunnels have no availability guarantee; launchd restarts the bridge after a tunnel process exit. Quick tunnels can also lose their public address while cloudflared keeps running, so the bridge calls its own public `/health` every three minutes (`HERMES_TUNNEL_CHECK_MS`); after two failed checks in a row it exits and launchd starts it with a fresh tunnel, which registers its new address. The UI can still serve saved views during an interruption.

## Services and logs

- Local website: `com.marcus.hermes-dashboard`, localhost port 3200.
- Cloud relay: `com.marcus.hermes-cloud-bridge`, localhost port 3202.
- Logs: `~/Library/Logs/Hermes Dashboard/`, `cloud-bridge.log` and `cloud-bridge-error.log`.
- Saved local snapshot: `~/Library/Application Support/Hermes Dashboard/cloud-snapshot.json`.

Restart the relay:

```bash
launchctl kickstart -k "gui/$(id -u)/com.marcus.hermes-cloud-bridge"
```

The existing local website service prevents idle system sleep only on AC power. Shutdown, logout and closed-lid sleep stop local work. Cloud hosting stays available independently.

## Updating and rollback

UI changes must be brought into the cloud build without overwriting its authentication, gateway, status bar, minimal server helpers or local-only restrictions. Build and test from `cloud/`; verify `.vercel/project.json` targets Hermes, then deploy from that directory. Never copy `.env.local`, local data, logs or provider credentials into deployment files. Both builds are versioned in the same repository. Vercel builds the `cloud` root from GitHub `main`; the Mac app remains at the repository root.

Vercel can roll back a deployment in its dashboard. Stop the bridge with `launchctl bootout gui/$(id -u)/com.marcus.hermes-cloud-bridge`. Removing cloud access does not delete the local app or its data. Blob and hosting usage follow the account's normal billing; no subscription upgrade was requested.

## Verification, October 18, 2026

Production deployment: `dpl_JDsf37xztS5VBLvV323ukSh52Exu`. Build and lint passed. Twelve automated tests passed. Eleven authenticated API checks passed. Seventy planned posts remained readable with the Mac relay disconnected, and offline writes returned an explicit error. Browser password sign-in and a full content card were checked. Anonymous private snapshot requests returned 403. Local tool routes are blocked in cloud and relay. Security review fixes cover deleted-record pruning and independent registration retries. Existing agent-run settings were preserved; no paid model run or post publication was used for testing.


## October 18, 2026: login update

Marcus requested a new dashboard password. Updated the production password hash and rotated the session signing secret. Verified the new password is accepted, the old password is rejected, and the previous session is rejected on the main dashboard URL. Updated the private local login reference. No password values are stored in this note. Active deployment: `dpl_EPhXPLApdpsUb1aSH7PKj8ku47b8`.

## October 18, 2026: carousels go live

Copied the Carousels and History pages, the Social sub-menu and `src/lib/carousel` into `cloud/`, and added Hermes posts to the cloud Calendar. Cloud production deployment: `dpl_5N5EzJjAhV8ryhVYT5mS2qdgpDf1`.

Relay changes (both copies of the security file stay identical):
- `safeApiPath` also allows `/api/social/media/<name>.png|jpg|webp`. Path tricks are still refused.
- The relay and the cloud gateway pass through `x-slide-flags` and `content-disposition`.
- Only JSON views join the background sync. `/api/social/postiz/*`, `/api/social/images/*` and `/api/social/media/*` are never re-polled, so the sync can't trip Postiz rate limits or spend money.

Uploads through the cloud site are limited to about 4 MB by Vercel. Larger photos must be uploaded on the Mac.

## October 19, 2026: carousel style previews

Added actual rendered cover/inner previews for Screenshot, Creative, Clone, Photo and Editorial on Social > Carousels. The gallery includes Creative template and Photo/Editorial layout choices, enlarged previews, and buttons that use the selected style. Clone examples are labeled until a real reference is supplied. Empty editors now show a style example; populated editors use current unsaved copy with request cancellation, stale-image protection, retry and blob cleanup.

A read-only `/api/social/previews` endpoint reuses the existing export renderer, with available local media. It does not create saved drafts, start AI jobs or publish. Existing cloud gateway and authentication are unchanged.

Verified 29 carousel unit tests, typecheck and focused lint in both apps, both production builds, ten 1080x1440 sample PNGs, invalid request handling, five unsaved editor renders with the saved draft unchanged, and authenticated website gallery/inner/enlarge/Creative template switching. The local build retains existing dynamic filesystem tracing warnings outside the preview change.

Production deployment: `dpl_HbMj9iAxurtd3aSUJc4ajLqA3Mzs`, aliased to https://hermes-dashboard-sandy.vercel.app. Local production service restarted on port 3200. Evidence: `docs/carousel-previews/`.


## October 19, 2026: screenshot variants and independent covers

Screenshot now has Text only and Text + image templates. Shared font sizing accounts for newlines, shows the current auto-fit size in Review, stops shrinking at 36px and flags overflow. Slide one can use a finished uploaded cover or a Marcus-skill cover while inner slides keep their template. Full artwork is contained without cropping or extra overlays.

Marcus cover jobs load the current saved skill, selected approved style, authoritative character sheet and brand docs. The existing authenticated Codex image bridge runs on the Mac. Jobs persist status and support browser-refresh polling; interrupted runs show an error instead of silently switching providers. No real image-generation call was used for verification.

Fixed the draft PATCH allowlist to persist the independent cover field. Verified upload persistence through production restart and rendered slide one and two with their separate designs. Unit tests: 44 passed. Typecheck, focused lint and both builds passed. Authenticated cloud UI showed the saved cover, both Screenshot variants and all ten Marcus styles. Jev selected contain fitting at 0.98 confidence.

Production deployment: `dpl_AqNsKpK8mxHsEZdzT1RXtABgJoV9`, aliased to https://hermes-dashboard-sandy.vercel.app. Local production restarted on port 3200. Evidence: `docs/cover-options/`. Cloud uploads retain the existing roughly 4 MB request limit.
