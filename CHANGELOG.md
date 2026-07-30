# Changelog

## Unreleased

- Added record-by-doing to Studio: a Record button in the scene editor turns trusted interactions inside the preview into flow actions live — keystroke bursts coalesce into one `type` with measured typing speed, checkbox/select/range changes map to `toggle`/`set`/`lever`, scroll bursts become one relative `scroll`, idle pauses become `afterMs` on the previous action, and a click that causes a navigation is replaced by `goto`. Recording appends rows incrementally (no re-render, so preview state survives), stops cleanly on any destructive editor change via the picker-cancel funnel, re-attaches across same-origin navigations, never records password fields, and ignores synthetic (non-`isTrusted`) events.

- Fixed the deployed live demo doing nothing on click. `build:pages` keyed cache-busting queries on the release version, so `app.js?v=0.2.1` kept its URL across a content change and the CDN went on serving the previous file; the stale copy's `const toast` collided with the new `fixtures.js` global of the same name, and the resulting SyntaxError stopped Projector from mounting. Cache keys are now content hashes, the two page scripts are wrapped in IIFEs so they cannot share global bindings, and the browser smoke test exercises `_site/` in addition to `examples/`.

- Added a shared agent cursor (`packages/core/cursor.js`) used by both Projector and Capture: it travels to each interaction target, emits position rings on arrival, dips with a ring burst on click and pointer taps, drifts while the page scrolls, and honours `prefers-reduced-motion`. It is created lazily on first use, so an idle page shows no pointer, and emphasis actions (highlight, glow, spotlight) deliberately do not move it. Projector now supplies `moveCursor` to the executor, so the existing cursor call sites are no longer no-ops in the browser. Configure with the `cursor` mount option (`'dot'`, `'arrow'`, or `false`).
- Added a `snippet` action that shows the code behind a step in a panel beside the target, docking to a corner when the target leaves no room. `keep` holds it on screen while later actions run.
- Added an intro beat: the control pill announces itself and the active flow before the first action runs.
- Added a runtime `timeScale` mount option and `ScreenReelCore.setTimeScale`, replacing per-example manifest rewriting. It scales the runtime's internal constants (countdown steps, flash pulses, reveal fades) that manifest rewriting could not reach, and presenter notes now ride the same scale.
- Added cursor travel and press feedback to `set` and `toggle`, which previously changed controls with no visible pointer.
- Fixed `flow.defaults.settleMs` being ignored during Projector playback; only `scene.settleMs` was read, so live and captured pacing diverged.
- Fixed scroll settling stalling in throttled or non-compositing tabs, where `requestAnimationFrame` can drop to about one frame per second; the settle check now races rAF against a timer.
- Re-cut the example guided tour to 6 scenes (~30s) and moved the showcase flow's drag, pointer, container-scroll, `waitFor`, and `call` fixtures to `destination.html`. Removed the "Explain each step as it plays" toggle and its floating panel.
- Fixed the example tour jumping to the top of the page after the form scene: scenes used `./#form` and `./` routes, so each hash change scrolled the document. Same-page scenes now share one route and rely on their own `scrollIntoView`.

## 0.2.1

- Added scene-level readiness waits and settle times to Projector playback, Studio previews, and CLI validation.
- Added configurable stop-at-end playback, completion and validation events, strict playback, and per-scene DOM validation.
- Added pluggable SPA route matching for legacy `.html` manifests.
- Added a page-function registry and deterministic awaiting of asynchronous `call` actions.

## 0.2.0

- Added self-hosted ScreenReel Projector and browser-local Studio.
- Added a shared 20-action runtime and six recipes across Projector, Studio, CLI Test, and Capture.
- Added versioned manifests, project-scoped local storage, MPA/SPA routing, presenter notes, selector picking, and AI-context export.
- Added inspect, validate, test, migrate, and projector-install CLI commands.
- Added Projector, Capture, and Demo Craft skills plus executable examples.

## 0.1.0

- Initial Playwright/FFmpeg ScreenReel capture CLI.
