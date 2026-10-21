# Hermes hybrid hosting implementation plan

Goal: Make the dashboard accessible on Vercel while keeping local execution and original data on Marcus's Mac.

Architecture: Deploy a separate cloud build of the same UI to the existing hermes-dashboard Vercel project. Authenticate every private page and API. An authenticated, narrow HTTP relay connects Vercel to local API routes through an outbound Cloudflare tunnel. Private Vercel Blob stores synced JSON views and the current relay address, allowing offline reading without redeployment when the tunnel changes. No local files or provider credentials are bundled. Local CRM, Recast and OpenAdKit embeds retain their local-only guards. Mutating operations require a live Mac and retain existing approval and agent-run gates. This design intentionally does not queue arbitrary commands for later execution.

Tech stack: Existing Next.js UI, Node.js relay, macOS launchd, Cloudflare quick tunnel, private Vercel Blob.

- [x] Test session authentication, relay path restrictions and private offline fallback behavior.
- [x] Build isolated cloud package from existing UI, replacing local backend with authenticated gateway and private snapshots.
- [x] Provision private Blob and server-only environment values on verified existing project.
- [x] Install local relay supervisor, which registers tunnel address and syncs changed views automatically.
- [x] Build and deploy, test unauthenticated denial, signed-in social calendar, local actions and offline fallback.
- [x] Save URL, credential location, logs, maintenance and rollback instructions. Keep localhost service intact.

Scope boundaries: No public CRM endpoints, no automatic publishing, no model calls for tests, no additional provider credentials uploaded. Blob and hosting use account billing with no plan upgrade. The user authorized production deployment. Existing unrelated edits remain untouched.

Verified: production deployment dpl_JDsf37xztS5VBLvV323ukSh52Exu; all 11 API smoke checks returned 200; 70 live and offline planned items; browser password sign-in and full caption card checked; unauthenticated and tampered-session requests rejected; local-only tools denied in both layers; private Blob anonymous access 403; cloud lint/build passed; 12 Node tests passed. Independent security review findings fixed and rechecked. Existing agent-run setting was already enabled and was not changed. No model execution or publishing was triggered for testing.
