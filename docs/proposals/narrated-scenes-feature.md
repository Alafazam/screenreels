# Proposal: narrated scenes in ScreenReel

> Status: proposal. Nothing here is built. The workflow it describes is documented in
> [narrated-scenes.md](../narrated-scenes.md) and runs today as a project script outside ScreenReel.

## Problem

Capture records a scene by running its actions in sequence and lays the voiceover over the clip
afterwards. That is fine for a walkthrough, but in a narrated film the click has to land on the word
that describes it. Today the only fix is tuning `afterMs` and `holdMs` by ear, and any change to the
script undoes the tuning.

The narrated-scene workflow solves this by generating the voice first, with word timestamps, and
placing every action, caption and camera key on the scene's clock from those words. It has been
used for four scenes of a launch film (S08-S11). The parts that are not specific to that film belong
in ScreenReel.

## How the spec maps onto flows, scenes and actions

A narrated scene stays a ScreenReel **scene** inside a **flow**. Most of the spec already has a home;
the rest is new, optional, and only read by Capture.

| Narrated spec | ScreenReel today | Proposal |
|---|---|---|
| `id`, `name` | `scene.id`, `scene.title` | reuse |
| `setup[0]` `goto` | `scene.route`, `scene.waitFor`, `settleMs` | reuse |
| `voice.text` | `scene.narration` | reuse; add `<pause S>` markup, stripped for live speech |
| `voice.leadS`, `tailS`, `durS` | `leadInMs`, `tailMs` (Capture defaults) | new `scene.voice: { leadS, tailS, style }`; `durS` as `scene.durS` |
| `voice.emotion` | none | `scene.voice.style`, passed to the provider as is |
| `actions[].do` | `action.type` | reuse the registry: `click`, `focus`, `wait`, `waitFor`, `goto`, `call`; `fill` -> `set`; `glide` -> `hover` |
| `actions[].target` | `action.selector` | `css` -> `selector`; `demo` -> `[data-demo-id=...]` selector |
| `actions[].at` | none | new `action.at`: number, word, or `{ word, nth, offset }` |
| `cursor`, `by` | mount option `cursor` (whole flow) | new `scene.cursor: 'agent' \| 'person'`, `action.by` |
| `step`, `event` | `call` (registered function) | new `event` action: dispatch a named window event (no code) |
| `waitUrl` | none | new `waitFor` condition `url` |
| `captions` | none | new `scene.captions: [{ at, text }]` |
| `camera` | none | new `scene.camera: [{ at, wide \| box \| focus, pad }]`, boxes in CSS px |
| `mocks`, `presets` | config `initScript`, `prepare(context)` | new declarative `scene.mocks` (`session`, `hide`, `replaceText`, `css`); `script` and presets stay in `screenreel.config.mjs` as named hooks |
| `continuesFrom` | none (scenes must reload on their own) | new `scene.continuesFrom: <scene id>`, Capture only |
| `blockWrites` | `prepare(context)` can route requests | new config `blockWrites` with an auth allowlist |
| `eval` | none | named hooks in `screenreel.config.mjs`, never inline code |
| `clip`, `beat`, `app` | `config.out.clips`, `config.baseUrl` | `clip` from config; `beat` stays with the compositor |

A scene is **narrated** when any of its actions has an `at`. Without one, Capture behaves exactly as
today, so existing flows are unaffected.

## What moves into ScreenReel

1. **Schema and validator.** The new fields in the JSON Schema; `flow validate` checks that every
   `at` word exists in the take, that `continuesFrom` has no loop, and that `role`/`text` targets
   are absent from flows Projector will play.
2. **Word-time resolver and timing checks** (from `scene.py` `plan`): resolve every `at` to seconds,
   apply the action lead (0.45 s), and check caption reading time, camera move length and end
   margin. Pure functions with unit tests; the constants become config.
3. **Timed recording** (from `record.mjs` and `lib.mjs` `Take`): fire each action at its time
   through the existing `ScreenReelCore.runAction`, resolve targets before the take, measure camera
   `focus` boxes alongside the actions, glide the cursor on wall-clock time, back-fill the first
   frame and hold the last to the scene's length, and write `<clip>.timing.json`. Capture already
   records through a CDP screencast with `deviceScaleFactor: 2`, so this is an extension of
   `lib/capture.mjs`, not a new recorder. The reference found that headless screencast frames
   arrive at 1x unless Chrome is launched with `--force-device-scale-factor=2`; Capture does not
   pass that flag today, which is worth checking on its own. A failed action fails the take (today
   Capture's adapter only warns).
4. **`continuesFrom` replay and declarative mocks.**
5. **Contact sheets**: `screenreel capture --sheet` writes a tiled still of each clip next to it.
6. **Voice with word times**: an optional `synthesizeWithTimings(text, outFile) -> { words: [{ w, s, e }] }`
   on the provider interface in `lib/voice.mjs`, plus the leading-silence correction. Word times are
   stored next to the audio with the text they came from, and planning refuses a stale take.

## What stays with the user

- **The TTS provider and its key.** ElevenLabs is what the reference uses; ScreenReel ships the
  interface and an example custom provider in the docs, not an SDK. `say` and `command` providers
  return no word times, so their scenes can only use numeric `at`.
- **The compositor.** Camera zooms, captions on screen, music and beat snapping are rendered by
  HyperFrames in the reference project. ScreenReel writes the data (clip, timing sidecar with camera
  boxes, captions as WebVTT); it does not render them.
- **App story modes.** Holding prepared state until a `story-step` event is the app's code.
  ScreenReel only dispatches the event.
- **Presets and dressing scripts**, as named hooks in the project's `screenreel.config.mjs`.

## Open questions

1. **One file per scene or one flow file?** The reference uses one file per scene so a scene can be
   reviewed and re-recorded alone. ScreenReel keeps a flow per file. Proposal: keep the flow file and
   add `screenreel capture <scene-id>`; revisit if flows get too long to review.
2. **Projector playback.** Word anchors need the audio file. Once pre-recorded narration lands
   ([roadmap](../roadmap.md)), Projector could fire `at` actions against the playing audio. Out of
   scope until then; Projector ignores `at` and plays the scene in sequence.
3. **`role` and `text` targets.** They are robust for filming but conflict with Projector's rule
   against text selectors. Allow them only in Capture-only flows, or not at all?
4. **Captions and camera in `assemble`.** A simple crop-and-zoom pass in ffmpeg would make the
   feature usable without a compositor. Worth it, or leave it to the user's tools?
5. **Forced alignment** for providers without timestamps (for example a local aligner over `say`
   output). Useful, but a new dependency.
6. **`continuesFrom` vs the "every scene reloads on its own" invariant.** Replay keeps each take
   reproducible from a cold browser, but a long chain makes takes slow. Cap the chain length?

## Phased plan

| Phase | Scope | Done when |
|---|---|---|
| 0 | This doc, [narrated-scenes.md](../narrated-scenes.md), and the `screenreel-narrated-scenes` skill | merged |
| 1 | Schema fields, validator, `screenreel scene plan` (resolver + timing checks) reading a word-times JSON from any source | unit tests cover word matching, `nth`/`offset`, every timing rule |
| 2 | Timed capture: `at` actions, agent/person cursor, pre-resolved targets, clock-pinned clip, timing sidecar, `focus` measurement, `--sheet` | S10 from the reference film re-recorded with ScreenReel matches the original's timing sidecar within one frame |
| 3 | Provider `synthesizeWithTimings`, `continuesFrom` replay, declarative mocks, `blockWrites`, `event` action | a scene goes from spec to clip with one command and no project script |
| 4 | Decide on captions/camera in `assemble` and Projector playback after narration audio ships | decision recorded here |
