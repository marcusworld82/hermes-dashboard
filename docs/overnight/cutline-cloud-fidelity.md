# Cutline cloud adapter and fidelity audit

**Cloud rendering remains blocked by default.** The new routes report this honestly. Actual Sandbox and private Blob SDK adapters exist and are tested through method-level mocks; no Sandbox, Blob write, snapshot, paid render, translation or transcription was executed. Authenticated HTTP routes now compose the adapters only after explicit owner configuration gates pass. No configuration was enabled during this task. Keys alone do not deliver cloud editor parity; licensed assets and reviewed snapshot/worker configuration are also required.

## Official architecture and implemented code

Sources reviewed: [official deployment guide](https://hyperframes.heygen.com/guides/deploy), [Vercel template sandbox](https://github.com/heygen-com/hyperframes-vercel-template/blob/main/lib/sandbox.ts), [snapshot preparation](https://github.com/heygen-com/hyperframes-vercel-template/blob/main/scripts/create-snapshot.ts), [template render endpoint](https://github.com/heygen-com/hyperframes-vercel-template/blob/main/app/api/render/route.ts), [Sandbox SDK](https://vercel.com/docs/sandbox/sdk-reference), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk). Blob API types were also inspected in installed `cloud/node_modules/@vercel/blob`.

The official template restores a snapshot with Chrome/FFmpeg/HyperFrames, renders a composition, and uploads a public Blob URL. This adaptation uses the same rendering architecture within existing authenticated Hermes, with no template replacement application. It removes fresh provisioning/install fallbacks and public outputs.

- `cutline-cloud-core.mjs`: ID-only bounded requests, safe bounded composition paths, injected worker enqueue/claim/run/finish, budget-before-provisioning, timeout/cleanup, Redo and generic failure codes.
- `cutline-cloud-provider.mjs`: prepared snapshot only, engine digest verification, fixed check/render commands, one render worker, no shell or user command arguments.
- `cutline-cloud-vercel.mjs`: actual injected SDK binding for `Sandbox.create({source:{type:'snapshot',snapshotId},networkPolicy:'deny-all',timeout,resources:{vcpus:2}})`, writeFiles/runCommand/readFileToBuffer/stop; SHA256 preview engine verification; Blob put/get/del with private access and owner-prefixed paths; streaming private download response returns no storage URL.
- `cutline-cloud-compiler.mjs`: original composition wrapper port with unchanged engine, bounded document validation, safe JSON script serialization, bundled trusted GSAP/fonts/audio and no fetched URLs.
- `cutline-cloud-store.mjs`: implemented private Blob ETag CAS state transactions, immutable owned revisions, claim/finish/cancel/interruption and durable conservative spending reservations. Storage errors never reset state.
- `cutline-cloud-snapshot.mjs`: explicit owner-approved snapshot setup task requiring setup reservation and pinned tool versions; not called by builds, routes or fallback and never executed in this task.
- `cutline-cloud-runtime.mjs`: configuration factory composes SDK adapters, compiler, queue, budget, source retrieval and worker. Construction makes no external calls.
- `cutline-cloud-status.mjs`, `cutline-cloud-live.ts`, `cutline-cloud-http.mjs` and `/api/cutline-cloud/**`: explicit production configuration gates and authenticated dispatch. Existing cloud proxy requires Hermes session and same-origin mutations. No alternate authentication is introduced.

No new dependency is needed for disconnected tests. Runtime SDK wiring requires a **pinned `@vercel/sandbox`** package, installed by the root task owner; `@vercel/blob` already exists. Modules accept the imported official `Sandbox` class and Blob module, enabling offline method-level tests without SDK network access. No runtime identity or credentials were inspected.

## HTTP integration and owner gates

Cloud `GET /api/cutline-cloud/status` requires the existing Hermes session (also verified within the handler). It reports specific missing storage, snapshot, asset, budget, spend and dispatch configuration; no storage or paid SDK calls run for status. If assets are declared ready, it verifies their local digests and compiler prerequisites. Storage health remains `not_checked`; flags never pretend quota has recovered. Root local Hermes has a read-only same-path status mirror with no SDK imports or dispatch route.

- `POST /api/cutline-cloud/jobs` validates bounded ID-only JSON and enqueues an owned immutable revision, returning 202 with a job and explicit dispatchPath. **Enqueue does not render.** Missing configuration returns 503 before runtime loading/storage/provisioning.
- `GET /api/cutline-cloud/jobs/[id]` reads owned persisted state without rendering.
- `POST /api/cutline-cloud/jobs/[id]/dispatch` is the explicit paid execution entrypoint, after all flags and durable budget reservation pass. It awaits one worker execution under a 300-second route limit; worker render timeout is 240 seconds. Durable atomic claim prevents duplicate render dispatch. An expired running lease becomes interrupted; dispatch never requeues it. Redo requires a new job request id.
- `POST /api/cutline-cloud/jobs/[id]/cancel` cancels queued jobs only. Running cancellation is rejected explicitly; timeout handles active Sandbox termination. No fake cancellation claim.
- `GET /api/cutline-cloud/jobs/[id]/output` requires an owned succeeded job and streams its private MP4, returning no Blob URL. Saved job reads/downloads remain available when spending is paused, provided private storage is enabled; they do not load compiler/Sandbox.
- Mutations independently verify same-origin HTTPS and the existing Hermes session, in addition to the app proxy. Existing Hermes is single-owner; server supplies owner=`owner`, never a request field. Generic failures redact SDK/storage paths, tokens and stderr. No job listing or media upload endpoint is introduced.

Required owner environment values (server-only):

```text
CUTLINE_CLOUD_SPEND_ENABLED=true
CUTLINE_CLOUD_STORAGE_ENABLED=true
CUTLINE_CLOUD_DISPATCH_ENABLED=true
CUTLINE_CLOUD_ASSETS_READY=true
CUTLINE_CLOUD_SNAPSHOT_ID=<prepared verified snapshot id>
CUTLINE_CLOUD_PER_JOB_CENTS=<approved positive integer maximum>
CUTLINE_CLOUD_DAILY_CENTS=<approved integer at least per-job maximum>
CUTLINE_CLOUD_CONCURRENCY=1
```

Private Blob uses existing Vercel OIDC/store configuration or the existing read/write credential. Restore capacity before enabling storage. Do not create/bypass a store to evade its quota. Spend and dispatch flags are separate; both default false. The conservative atomic budget ledger reserves the full per-job ceiling before provisioning and counts each attempted job against that day's ceiling. It is an application budget, not a guarantee about Vercel invoices.

Install trusted assets at fixed server-only `cloud/cutline-runtime-assets/` (relative to deployed cloud cwd), outside public/. Owner `manifest.json` schema:

```json
{
  "version": 1,
  "engineDigest": "<sha256 of bundled public/cutline-assets/engine.js>",
  "gsap": {"file": "gsap.js", "sha256": "<sha256>"},
  "fonts": [{"family": "Avenir Next", "file": "avenir.woff2", "sha256": "<sha256>"}],
  "audio": {
    "whoosh.mp3": {"file": "whoosh.mp3", "sha256": "<sha256>"},
    "whoosh-heavy.mp3": {"file": "whoosh-heavy.mp3", "sha256": "<sha256>"},
    "click.wav": {"file": "click.wav", "sha256": "<sha256>"}
  }
}
```

All fonts used by a saved project must be licensed and listed. Loader validates fixed filenames, limits, SHA256 and realpath containment; assets cannot be request paths or URLs. `Avenir Next` is required because it is the original engine fallback; absent licensing, cloud rendering stays blocked rather than silently changing typography. Owner asset bundle must be included in server deployment packaging; no assets were fabricated or added by this task.

Owner must privately ingest verified media and immutable revision metadata through the server runtime API before enqueue. No browser upload route exists, so the UI must keep upload disabled. Configure an external durable scheduler to call the authenticated explicit dispatch route if browser-independent scheduled dispatch is desired; this task does not install a scheduler or send any messages. Browser users can explicitly dispatch one queued job; request completion is awaited, never fire-and-forget.

## Feature fidelity matrix

Inspected source: original local `CAPTION-STUDIO/README.md`, `lib.mjs`, `engine.js`, `editor.html`, `server.mjs`. README historical render/UI claims were not rerun and are not cloud verification.

| Feature | Original behavior and requirement | Cloud state |
| --- | --- | --- |
| Word edits | Drag/multiselect/nudge/edit/resize/snap/undo, autosaved doc | Browser shell preserved; owned revision persistence implemented; HTTP editor backend disconnected |
| Spotlight/scopes | All/small/spotlight text; word/caption/speaker/global inheritance | Same browser engine retained; compiler preserves document data; visual fidelity unverified |
| Speakers | Python/numpy voice-print guessing, manual assignments, per-speaker looks | Detection absent; not true diarization; existing label data must be preserved |
| Keyframes/curves | Caption move/scale/rotation/fade and saved curves | Requires same doc+engine and curve storage; unverified |
| Motion | Caption engine animates preview and render | Compiler and adapter preserve and verify engine digest; visual fidelity unverified |
| Video transitions | Punch/zoom/whip/spin/shake/flash/dip/glitch/light leak; face targeting; FFmpeg cuts | Preserve engine renderVideo, transition doc, face data and cuts; unverified |
| SFX | Whoosh/heavy whoosh/click, caption and transition timing/volume | Must bundle original licensed audio privately; not added by this change |
| Saved styles/layouts | Local JSON layouts/styles/curves | Revision storage exists; style/layout editing routes not connected |
| Keep face clear | Apple Vision Swift binary at two samples/sec, manual box fallback | Detector Mac-only; Linux substitute not implemented; retain manual/precomputed data |
| Fonts | Mac font menu; composition uses local installed families | Linux availability/licensing/metrics differ; no silent font substitution |
| Translation | Mac `claude -p`, text only, length-weighted translated timing | Mac-only; no cloud API/account migration |
| Watch folder | Mac INBOX-AUTO/done/OUTPUT, polls every ten seconds | Mac-only; serverless cannot watch a user's Mac folder |
| SRT | Local project export file | No cloud SRT HTTP endpoint; source engine SRT remains available locally |
| MP4 | Local shared engine→HF check/render→render.mp4 | Actual SDK adapter code, mocked only; production blocked |
| CLI/hands-off | `cli.mjs auto`, transcription/faces/layout/auto-transitions | Local only; cloud transcription/workflow not implemented |

**Shared engine is mandatory.** Do not rebuild captions in an independent cloud renderer. Original `compositionHTML(doc)` embeds the same engine and calls `CaptionEngine.render`/`renderVideo`; preserve that behavior with the same digest, assets and font metrics. The port replaces original raw JSON script interpolation with escaped serialization, validates bounded document structure/timing and rejects unsafe style/URL strings and unapproved fonts; more permissive future schemas require a fresh audit. `validateBundle` only checks paths/size; it is not a JS/HTML sanitizer. Its caller must create a trusted server bundle, never accept uploaded composition HTML, engine JS or arbitrary URLs. Bundle trusted pinned GSAP locally because original source uses CDN loading and Sandbox networking is denied. Source video/audio/timeline conventions and legacy `check` CLI arguments need validation against the pinned snapshot version before live use.

## Job lifecycle, interruption and retry

Worker enqueue authorizes immutable owned revision, creates queued job, and atomically deduplicates owner+requestId. Claim must atomically allow one worker. Success returns an opaque private output id. Failure/timeout never retries. Redo creates a new requestId/job and new reservation referencing an owned terminal job. The store must mark expired running leases `interrupted`, never requeue them, and condition finish on the active lease. Queued-job cancel API is connected. Expired leases are interrupted on dispatch; no recurring recovery worker is installed. Cancelled/interrupted states are explicit Redo sources.

Render execution has a maximum 240-second timer, abort signal and Sandbox TTL. Timeout aborts and requests stop. Unknown/failed stop retains the spending reservation until reconciliation; SDK cancellation alone does not prove infrastructure termination. Private uploads must honor abort; interrupted uploads need orphan retention cleanup. Preflight compiler/budget calls require infrastructure timeouts separately. Budget reserve must enforce a concrete approved per-job maximum, daily cap and concurrency limit atomically. Never trust a client budget flag or silently retry paid work.

## Owner configuration and remaining implementation before enablement

1. Explicit owner budget approval. The atomic durable reservation backend is implemented; no spending is authorized.
2. Private output storage capacity: existing Blob store was reported suspended until November 20. No new store or billing/quota change attempted. This date never automatically enables rendering.
3. Configured Blob CAS backend provides owned immutable revisions, queue claims and budget persistence; supply private storage and a durable dispatcher. Never use an in-memory map or fire-and-forget HTTP promise in production. Uploads must verify MIME/signature/size/duration/resolution, retention and ownership; arbitrary source URLs must never be fetched.
4. Configure the implemented typed-doc compiler with unchanged engine and server-resolved private assets. Exact font and audio licensing/files; no secret/project directory vendoring. Preserve supported data and reject unsupported cloud actions explicitly.
5. Separately approved preparation of pinned HyperFrames/Chrome/FFmpeg snapshot, bundled GSAP/fonts, recorded engine digest and expiry. No automatic snapshot build or fresh fallback. Wire imported official SDKs into injected adapters after version/API review.
6. Authenticated enqueue/poll/cancel/dispatch/download HTTP wiring is implemented; finish owned project ingestion and configure an approved durable dispatch strategy. Private streams only; no public Blob URL.
7. Only after separate runtime authorization, run a small live render plus visual/audio regression fixtures for all rows above. Check lint/runtime, dimensions, duration, caption timing, font metrics, transition/SFX alignment and output completeness. Mock tests are not live SDK or visual-parity evidence.

## Verification

`node --test tests/cutline-cloud.test.mjs`: 15 passing tests, covering fail-closed status, strict input, streamed body bounds, unsafe/duplicate bundle paths, owned async/idempotent jobs, single claim, private output ids, budget-before-provisioning, timeout stop/no retry, Redo, redacted failures, failed-stop reservation retention, exact SDK snapshot/network/command/file binding, SHA256 mismatch and private Blob write/download paths, compiler injection/font rejection, CAS daily budget enforcement and interrupted leases. Cloud TypeScript check passes. No live or paid test ran.

The durable backend charges each attempted render the full approved per-job reservation against the day even after successful cleanup, avoiding optimistic under-accounting. It is a conservative application ledger, not a Vercel billing limit. Approve a sufficient worst-case infrastructure price before any live test. CAS state is bounded to 8 MiB and needs retention/compaction before sustained use. Runtime source streaming is bounded to 128 MiB.

## Configuration factory example (do not invoke a paid worker without owner approval)

```js
import { Sandbox } from "@vercel/sandbox";
import * as blob from "@vercel/blob";
import { createConfiguredCutlineRuntime } from "./cutline-cloud-runtime.mjs";
const runtime = createConfiguredCutlineRuntime({
  Sandbox, blob, snapshotId: ownerConfiguredSnapshotId,
  approvedBudget: { perJobCents: approvedMaximumCents, dailyCents: approvedDailyCents, concurrency: 1 },
  trustedAssets: { engine, engineDigest, gsap, fonts: licensedWoff2Files, audio: licensedSfxBuffers },
});
// Server-authenticated owner only; no client-supplied owner or asset URL.
// Persist private source media first, then saveRevision(owner,id,revision,doc,ownedAssetPath).
// enqueue persists only; a durable dispatcher invokes worker.run(owner,jobId) once.
```

Root task subsequently installed pinned @vercel/sandbox@3.9.1 and @vercel/blob@2.8.2. Adapter method signatures/networkPolicy and Blob ifMatch were checked against their installed types. No SDK operation was invoked.

HTTP verification additionally covers unauthenticated status rejection, cross-origin POST rejection, configuration-before-runtime gating, enqueue without paid execution, explicit single dispatch, owned private output and downloads after pausing spending. Root and cloud TypeScript checks plus targeted cloud ESLint pass. No real render was run.
