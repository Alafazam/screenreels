---
name: screenreel-video-craft
description: The craft rules for making product demo/launch video captures that actually look good — scene pacing, determinism, selector strategy, money moments. Read this BEFORE authoring or editing screenreel scenes, storyboarding a demo video, or debugging a capture that looks wrong (blank charts, flicker, mistimed actions, footage that changes between runs). Applies to any scripted screen-capture work, not only the screenreel tool.
---

# Video craft — what separates a good demo capture from a broken one

These rules exist because captured video is unforgiving: everything the page does wrong is preserved at 30fps, and nobody re-watches a demo that made them wait. Each rule states the failure it prevents.

## Determinism first

**The app must produce identical footage on every run.** Re-captures are constant (pacing tweaks, UI fixes), and a diff-able reel is how you notice regressions.

- Drive screens from fixtures, not live APIs. No `Date.now()`, no `Math.random()`, no network calls that can vary. If "today" appears on screen, pin it in the fixture.
- Scenes must be idempotent: capture runs them repeatedly. If an action mutates state (approve, apply-fix), the page must reset on reload — fixture state, not persisted state.
- Pin the theme (localStorage via `initScript`). Light theme unless the app is genuinely dark-polished — half-dark-optimized UIs read as broken on camera.

## One money moment per scene

A scene earns its place by showing **one** thing changing: a toast landing, a diff appearing, a number dropping, a node being added. Everything else in the scene is setup for that beat.

- 8–20 seconds per scene. Under 8s the viewer can't orient; over 20s you have two scenes pretending to be one — split them.
- Structure every scene: **orient → act → land**. Lead-in stillness (viewer reads the screen), the action sequence (cursor visibly does the thing), tail stillness (the result sinks in). That is exactly what `leadInMs` / actions / `tailMs` encode.
- Order scenes as a story (the user's real workflow), not as a feature tour. A checklist → detail → fix → dashboard arc beats six unrelated screens.

## The cursor and toasts are the narration

Captions and voiceover usually don't exist in raw captures — the viewer follows the cursor. So:

- Never let anything happen "by magic". Route programmatic triggers through `call` with `cursorTo` pointing at the UI element a human would have used — the cursor travels there, *then* the effect lands.
- Toasts/banners are load-bearing: they say what just happened. If an important action has no visible acknowledgment in the app, add one to the app before capturing — it improves the product, not just the video.
- Use sequenced glow to direct the eye across a list/grid before acting on one item. One glow box gliding element-to-element reads as "look here, here, here"; twelve simultaneous highlights read as noise.

## Selector strategy

- Script against `data-action` / `data-*` attributes, never styling classes — classes churn with every redesign and captures break silently (soft-fail warnings, missing beats).
- If the screens lack them, **add the attributes to the app source** as part of the capture work. Stable hooks pay off on every re-capture and in tests.
- For agent/AI moments, have the app expose a page-global demo hook (`window.demoApplyAgentReply()`) that deterministically plays the scripted response. One `call` beats a brittle chain of clicks and typed text.

## Timing discipline

- `settleMs` absorbs the app's compose time: fonts, ECharts/canvas draws, image loads. Blank chart in the clip = raise settle, don't trim the clip.
- Every action's `afterMs` is a rhythm decision: long enough for the result to render and be noticed (~1.4–2s for a panel update, ~3–4s for an agent reply), short enough not to drag.
- Watch for re-render storms: views that redraw wholesale on every input event leave `<img>` tags perpetually reloading on camera. Throttle event dispatch (the `lever` action already does) or fix the view.
- A scene whose last action navigates needs `endsInNavigation: true` — and remember the destination page is what the tail records.

## Technical invariants

- Capture at 2× device scale, encode at 1080p — text stays crisp after downscale.
- Clips are all-intra (`-g 1`) constant-frame-rate H.264. That is what makes them exact-seekable for later editing or a HyperFrames composition. Don't "optimize" the encoder settings for size; the final stitch re-encodes once anyway.
- Verify by extracting mid-action frames and *looking at them* (cursor visible? money moment on screen? no loading spinners?). Never declare a capture done from exit codes alone.

## Storyboarding checklist (run through before authoring scenes)

1. Who is the video for, and what one sentence should they say after watching?
2. Which 4–8 journeys tell that story, in what order?
3. For each: what is the money moment, and what's the minimal setup to reach it?
4. Does every money moment have a visible acknowledgment (toast/diff/number)?
5. Are the fixtures numerically consistent across scenes? (The same KPI showing different values in scene 2 and scene 5 destroys trust.)
6. What state does each scene assume, and does a fresh page load provide it?
