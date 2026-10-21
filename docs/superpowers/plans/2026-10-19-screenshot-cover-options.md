# Screenshot Variants and Independent Covers

Goal: Keep the current auto-fit behavior understandable, offer Screenshot text-only and text-plus-image versions, and let slide one use a finished upload or a Marcus-skill cover independently of the inner-slide template.

Product brief: Marcus wants to reuse his existing generator. Cover artwork is separate from body formatting. Existing text shrinks to fit, down to 36px in Screenshot; overflow is flagged rather than split. Show that behavior in Review. Preserve uploaded cover text through contain fitting. Skill generation uses only the existing Codex built-in image bridge with authoritative identity and selected saved style, no paid fallback. A generated cover needs visual review and is not publication approval.

- [x] Tests first: variants, independent cover rendering and persistence, line-break-aware fitting, cover prompt rules and reference selection, generation attachment preserving edited inner slides.
- [x] Screenshot choices, shared size calculation and clear Review controls.
- [x] Independent cover upload and rendering, across all modes and exports.
- [x] Marcus cover skill builder and persisted background job through existing Codex bridge. Poll status; do not run a real model during implementation tests.
- [x] Unit/API checks, typecheck/lint, browser inspection, local/cloud builds and deployment.
