# Content Machine and live dashboard implementation

Authorized by Marcus in this chat, October 18, 2026. Extend existing local Next.js app and Vercel hybrid. Preserve in-progress user changes. No Obsidian writes, publishing or external messages during implementation. Agent smoke calls authorized by full functionality request.

## Tracks and ownership

1. Runtime/agents: repair home chat, provider readiness and OpenRouter credential reuse; verify all installed profiles. Remove read-time mutations and automatic Obsidian writes. Make Kanban/pipeline/workflow controls perform real validated task mutations. Test bad input, disabled runs, CLI failures and linked steps.
2. Content engine: durable per-piece state and revision-scoped approvals, one persisted queue with exclusive lease, heartbeat and crash recovery, typed source/script/build/cover stages. Use actual local models/tools and existing styles. No fake successful generation; failure states keep logs and allow safe retry except ambiguous publishing.
3. Content workspace: Social Content Machine tab, topic/source/script fields, upload and existing LWM style selection, Build draft, cover handoff, real video preview, exact-package approval and Postiz scheduling. Preserve accepted pilot cover/caption.
4. Integration: routes validate fields/actions; uploads sent in bounded chunks through existing relay; media range requests work for playback; no arbitrary filesystem paths. Extend relay allowlist and snapshots, copy tested UI to cloud, install supervised worker, rebuild and restart local app, deploy cloud after reviewable changes and passing checks.

## Interfaces

GET /api/social/content returns pieces/styles/worker/sources. POST creates a piece. PATCH saves sources. /[id] GET/PATCH updates allowed fields, POST invokes a typed action. /[id]/upload accepts indexed base64 chunks with upload ID, kind, MIME and bounded size. /[id]/asset?kind returns an owned asset only. All writes keep existing origin protection. Approval binds content revision, asset hashes, account IDs and UTC schedule time; editing invalidates it. No auto-publishing.

## Verification

Meaningful tests cover duplicate stage requests, stale approvals, uncertain publishing, leases/crash recovery, unsafe paths, malformed chunks, media content types and cloud request forwarding. Run all node:test suites, TypeScript, lint and production builds. Read-only connection/auth tests plus bounded agent smoke calls verify actual execution. Exercise create/edit/upload/build/cover/import/review states on the local app and authenticated cloud relay. Do not claim a provider works from a saved key alone.

## Production style

Use maintained Split Talking Head route first; list all saved LWM styles with honest executable/needs-adapter states. Persa remains rejected. Build workers create isolated job projects, read current brand/marketing laws, align narration/captions, check and render to actual files. Subject-specific proof remains sourced or clearly labeled as schematic. No wholesale adoption of rejected pilot visuals.

## Review focus

Large uploads through a small relay, duplicate clicks after timeout, app restart during a render, approval after changed content, and an unavailable subscription/model. Must surface failures instead of showing a decorative success state.
