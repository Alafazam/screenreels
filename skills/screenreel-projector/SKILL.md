---
name: screenreel-projector
description: Embed, author, validate, migrate, or debug interactive ScreenReel product demos and its browser-local Studio. Use for adding a demo/projector button, configuring MPA or SPA routing, creating or editing flows and talking points, repairing selectors, testing action playback, installing self-hosted browser assets, or integrating ScreenReel Projector into a web application.
---

# ScreenReel Projector

Build against the running application and the checked-in flow source. Keep canonical flows application-owned; store personal edits only in ScreenReel's project namespace.

## Workflow

1. Inspect the host's build, router, content-security policy, and existing navigation button.
2. Run `screenreel projector install --out <static-assets-dir>` after `npm run build` in ScreenReel.
3. Add either `<screenreel-projector>` or `ScreenReel.mount(existingButton, options)`. Require a stable `projectId`.
4. Supply a local/remote JSON URL or inline manifest. Use router hooks for an SPA.
5. Run `screenreel flow inspect --base-url <url> --route <route> --json` before inventing selectors.
6. Prefer `data-demo-id`, unique IDs, and stable `data-*` attributes. Add a hook only when generic picking cannot produce a stable selector.
7. Run `screenreel flow validate ... --json`, then `screenreel flow test ... --screenshots`.
8. Inspect screenshots and exercise Projector plus Studio in the real host.

Read [references/actions.md](references/actions.md) when authoring or repairing actions. Use the `screenreel-demo-craft` skill when deciding scene boundaries, talking points, or narrative order.

## Guardrails

- Keep navigation same-origin unless the user explicitly expands the boundary.
- Never use text selectors or arbitrary JavaScript evaluation.
- Treat iframe-blocked or cross-origin previews as metadata-only authoring surfaces.
- Do not clear non-ScreenReel storage.
- Preserve unknown imported actions as locked data.
- Keep Projector browser assets independent of Playwright and FFmpeg.
