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
used for four scenes of a launch film (S08-S11). Everything in it except the TTS API key and the
film's own content is reusable and belongs in ScreenReel: the spec and recorder, the voice
provider, the compositor, and the app-side story mode.

## How the spec maps onto flows, scenes and actions

A narrated scene stays a ScreenReel **scene** inside a **flow**. Most of the spec already has a home;
the rest is new and optional.

| Narrated spec | ScreenReel today | Proposal |
|---|---|---|
| `id`, `name` | `scene.id`, `scene.title` | reuse |
| `setup[0]` `goto` | `scene.route`, `scene.waitFor`, `settleMs` | reuse |
| `voice.text` | `scene.narration` | reuse; add `<pause S>` markup, stripped for live speech |
| `voice.leadS`, `tailS`, `durS` | `leadInMs`, `tailMs` (Capture defaults) | new `scene.voice: { leadS, tailS, preset }`; `durS` as `scene.durS` |
| `voice.emotion` | none | `scene.voice.preset`: a named provider preset from config |
| `actions[].do` | `action.type` | reuse the registry: `click`, `focus`, `wait`, `waitFor`, `goto`, `call`; `fill` -> `set`; `glide` -> `hover` |
| `actions[].target` | `action.selector` | `css` -> `selector`; `demo` -> `[data-demo-id=...]` selector |
| `actions[].at` | none | new `action.at`: number, word, or `{ word, nth, offset }` |
| `cursor`, `by` | mount option `cursor` (whole flow) | new `scene.cursor: 'agent' \| 'person'`, `action.by` |
| `step` | `call` (registered function) | new `step` action: advance the page's story (see the story contract) |
| `event` | `call` | new `event` action: dispatch a named window event (no code) |
| `waitUrl` | none | new `waitFor` condition `url` |
| `captions` | none | new `scene.captions: [{ at, text }]`, rendered by the compositor |
| `camera` | none | new `scene.camera: [{ at, wide \| box \| focus, pad }]`, boxes in CSS px, rendered by the compositor |
| `mocks` `session` | config `initScript` | `scene.seed`, applied by the story contract before the app boots |
| `mocks` `hide`, `replaceText`, `css` | config `initScript`, `prepare(context)` | declarative `scene.mocks`, applied by the story contract |
| `mocks` `script`, `presets`, `eval` | none | named hooks in `screenreel.config.mjs`, never inline code |
| `continuesFrom` | none (scenes must reload on their own) | new `scene.continuesFrom: <scene id>`, Capture only |
| `blockWrites` | `prepare(context)` can route requests | new config `blockWrites` with an auth allowlist |
| `beat` (`music`, `transitionIn`) | none | new `scene.film: { music, transitionIn }`, read by the compositor |
| `clip`, `app` | `config.out.clips`, `config.baseUrl` | reuse |

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
   frame and hold the last to the scene's length, write `<clip>.timing.json`, and write a contact
   sheet. Capture already records through a CDP screencast with `deviceScaleFactor: 2`, so this
   extends `lib/capture.mjs`. The reference found that headless screencast frames arrive at 1x
   unless Chrome is launched with `--force-device-scale-factor=2`; Capture does not pass that flag
   today, which is worth checking on its own. A failed action fails the take (today Capture's
   adapter only warns). `continuesFrom` replay and `blockWrites` belong here too.
4. **Voice provider** (from `narrate.py`). A provider interface in `lib/voice.mjs` with an optional
   `synthesizeWithTimings(text, outFile) -> { words: [{ w, s, e }] }`, and an **ElevenLabs adapter**
   as the first implementation:
   - the `with-timestamps` endpoint, characters grouped into words;
   - named voice presets (stability, similarity, style, speaker boost) and a model per config;
   - `<pause S>` turned into an SSML `<break time="Ss"/>`;
   - silence trim and loudness normalisation, with the trimmed lead subtracted from word times;
   - a cache keyed by text, voice, model and settings, and a per-line generation budget;
   - the key read from `ELEVENLABS_API_KEY` only, never written to config, flow or logs.

   Word times are stored next to the audio with the text they came from; planning refuses a stale
   take. `say` and `command` keep working without word times, so their scenes use numeric `at`.
5. **Story-mode contract** (a small page-side API in `packages/core`). The reference app's story
   mode is the same idea as ScreenReel: the app holds scripted state and the film advances it.
   ScreenReel defines it once instead of each app inventing it:
   - `ScreenReel.story.register(name, { frames: [fn, ...] })`: each frame puts the app in one
     visible state and must be safe to run twice;
   - the app holds each frame until a `step` action, which dispatches `screenreel:story-step` (the
     reference's `story-step` is accepted as an alias), and emits `screenreel:story-frame` with the
     frame index so the recorder can check that every frame landed;
   - `scene.seed` writes session or local storage before the app boots; `scene.mocks` (`hide`,
     `replaceText`, `css`) are reapplied on an interval so re-renders cannot undo them;
   - the validator warns when two `step`s are less than 0.4 s apart.

   Capture uses it for films; Projector can use the same frames for a live tour that needs the app
   in a scripted state.
6. **Compositor** (from `build-mg2.py`, `mg2.template.html`, `mix_mg2.py` and the `style`, `audio`
   and `render` sections of `mg2.json`). A `screenreel film` command that turns a narrated flow, its
   clips and timing sidecars into a finished video:
   - an HTML timeline per scene rendered with HyperFrames;
   - camera keys as fit-to-box zooms: padding, a scale cap (1.4x), never smaller than the frame,
     0.5-0.8 s eased moves;
   - captions at their words, with the reading-time guard;
   - a pinned logo between brand-in and brand-out anchors;
   - a music bed with fades, sidechain ducking under the narrator, and scene ends snapped to the
     music's beat grid (a beat file or a fallback BPM);
   - the narration mix, a limiter, and an AAC mux onto the silent render;
   - per-scene builds with their own HTML, timing and mix files, rendered in parallel, one
     HyperFrames worker each.

   Style, brand and audio settings move into a `film` section of `screenreel.config.mjs`.
   `assemble` stays as the simple path for un-narrated reels.

## What stays with the user

- **The TTS API key**, in the environment.
- **The film's content**: the script, scenes, presets and dressing hooks, brand assets, music track
  and its beat file.

## Open questions

1. **One file per scene or one flow file?** The reference uses one file per scene so a scene can be
   reviewed and re-recorded alone. ScreenReel keeps a flow per file. Proposal: keep the flow file and
   add `screenreel capture <scene-id>`; revisit if flows get too long to review.
2. **HyperFrames as a dependency.** Bundle it, make it an optional peer dependency that `screenreel
   film` checks for, or put the compositor behind a renderer interface?
3. **Projector playback.** Word anchors need the audio file. Once pre-recorded narration lands
   ([roadmap](../roadmap.md)), Projector could fire `at` actions against the playing audio and reuse
   the ElevenLabs provider. Until then, Projector ignores `at` and plays the scene in sequence.
4. **`role` and `text` targets.** They are robust for filming but conflict with Projector's rule
   against text selectors. Allow them only in Capture-only flows, or not at all?
5. **Story contract in production builds.** Should apps ship the frames behind a flag, or only in a
   demo build?
6. **Forced alignment** for providers without timestamps (for example a local aligner over `say`
   output). Useful, but a new dependency.
7. **`continuesFrom` vs the "every scene reloads on its own" invariant.** Replay keeps each take
   reproducible from a cold browser, but a long chain makes takes slow. Cap the chain length?

## Phased plan

| Phase | Scope | Done when |
|---|---|---|
| 0 | This doc, [narrated-scenes.md](../narrated-scenes.md), and the `screenreel-narrated-scenes` skill | merged |
| 1 | Schema fields, validator, `screenreel scene plan` (resolver + timing checks) reading a word-times JSON from any source | unit tests cover word matching, `nth`/`offset`, every timing rule |
| 2 | Timed capture: `at` actions, agent/person cursor, pre-resolved targets, clock-pinned clip, timing sidecar, `focus` measurement, contact sheets, `continuesFrom`, `blockWrites` | S10 from the reference film re-recorded with ScreenReel matches the original's timing sidecar within one frame |
| 3 | Voice provider: the `synthesizeWithTimings` interface and the ElevenLabs adapter (presets, `<pause>`, trim, cache, budget, env key) | S08-S11 lines regenerate with word times identical to `narrate.py`'s for the same audio |
| 4 | Story-mode contract: `ScreenReel.story`, `step`/`event` actions, `seed`, declarative `mocks`, frame events | the reference prototype's workflow build runs through the contract with no app-specific capture code |
| 5 | Compositor: `screenreel film` with camera, captions, logo, music bed, ducking, beat snapping, mix and mux, parallel per-scene renders | S08-S11 render from ScreenReel and match the reference renders on a side-by-side contact sheet, with audio in sync within one frame |
| 6 | Projector playback of narrated scenes against pre-rendered audio | decided after pre-recorded narration ships |
