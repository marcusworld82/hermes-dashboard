# Carousel Previews Implementation Plan

**Goal:** Show actual rendered slides for all five carousel modes inside Hermes Social > Carousels.
**Architecture:** Reuse renderSlide for read-only sample PNGs. Keep samples ephemeral, label clone examples, and show real media when available. Add a responsive style gallery, cover/inner choice and enlarged previews. Keep unsaved editor renders and clean up stale requests and blob URLs. Mirror only changed shared UI/model files into the cloud app and retain its gateway/security.
**Tech stack:** Next.js 16.4, React 19, next/og, existing Node tests.

- [x] Add failing tests for sample mode/template/layout validation and original draft isolation.
- [x] Implement sample model and read-only previews route with no AI or storage writes.
- [x] Add gallery and enlarged preview; add empty-editor style example and render cleanup/retry.
- [x] Run tests, typecheck and lint; verify real PNGs for each mode and browser gallery.
- [x] Mirror shared UI into cloud, build and deploy the existing cloud project, verify live response.

Product brief: Marcus currently has a working generator but cannot compare actual styles on the start page. The objective is to see rendered cover and body pages before choosing and while editing. Existing exports are the visual source of truth. Clone samples must not imply an uploaded reference was analyzed. No generation, posts or scheduling occur in preview. Success: all five modes produce visible PNG previews; errors are recoverable; edits show the current slide; navigation and mobile layout remain usable.
