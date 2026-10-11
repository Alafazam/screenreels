# Narrated scenes

**What it is:** a way to film one scene of a product video so the screen changes on the narrator's
words. One JSON file per scene says what the narrator says (with pauses), what the app shows, what is
mocked in the capture browser, which action happens on which word, the captions, and where the
camera looks. A small pipeline turns that file into the narrator take, a screen recording timed to
the take, and a beat a video compositor can render.

> Status: this is not part of ScreenReel yet. It is a working workflow built for a product launch
> film, documented here because it is close to what Capture does. The reference implementation lives
> outside this repository (see [Using it today](#using-it-today)). The proposal for making it a
> ScreenReel feature is [proposals/narrated-scenes-feature.md](proposals/narrated-scenes-feature.md).

## How it differs from a Capture flow

A Capture scene runs its actions in sequence: each action waits for the previous one, then for its
own `afterMs` or `holdMs`. The clip is as long as the actions take, and voiceover is laid over it
afterwards (`overflow: 'extend'` freezes the last frame when the voice runs long).

A narrated scene works the other way round. The voice is recorded **first**, with a timestamp for
every word. Every action, caption and camera move is then placed on the scene's clock, usually by
naming the word it belongs to. The recorder fires each action at its time and pins the clip to the
take's clock, so the picture and the voice line up without editing.

| | Capture flow scene | Narrated scene |
|---|---|---|
| Timing | Sequential: `afterMs`, `holdMs`, `dwellMs` | Absolute: every `at` is seconds into the scene, usually from a word |
| Voice | Added after recording, over the clip | Recorded first; it sets the scene length and the times |
| Length | Whatever the actions take, plus `tailMs` | `leadS` + the spoken line + `tailS` (or a fixed `durS`) |
| State | Each scene is reloadable on its own | A scene can replay earlier scenes off camera (`continuesFrom`) |
| Output | A clip per scene, stitched by `assemble` | A clip, a timing sidecar with camera boxes, and a beat for a compositor |

## The file

One file per scene, named after its id (`S10.json`). Comments below are for reading only; the real
files are plain JSON.

```jsonc
{
  "id": "10",                          // the scene / beat id; the narrator line uses the same id
  "name": "Start the cycle",
  "app": "prototype",                  // which running app to open (a named base URL)
  "viewport": [1920, 1080],            // CSS px; recorded at 2x, so clip px = 2 x CSS px
  "blockWrites": false,                // refuse every non-GET request in the capture browser
  "clip": "assets/ui/s10-start-cycle.mp4",
  "continuesFrom": "09",               // replay that scene (setup + actions, untimed) off camera first
  "presets": ["workflow-story"],       // named mocks and ${VARS}, defined in code
  "beat": { "music": 4, "transitionIn": "cut" },   // passed through to the compositor
  "durS": 8.35,                        // optional fixed length

  "voice": {
    "text": "It starts the cycle. <pause 0.4> The data comes in...",
    "emotion": "confident",            // a named TTS settings preset
    "leadS": 0.8,                      // when the narrator starts, seconds into the scene
    "tailS": 1.6                       // how long the scene runs after the narrator stops
  },

  "mocks": [                           // capture browser only; each one says why
    { "why": "...", "session": { "key": "value" } },
    { "why": "...", "hide": { "text": ["Beta"], "within": "nav" } },
    { "why": "...", "replaceText": [{ "from": "System", "to": "Dana", "within": "header" }] },
    { "why": "...", "css": "#banner { display: none }" },
    { "why": "...", "script": "story.mjs#dressSettings", "args": {} }
  ],

  "setup": [ /* steps run off camera before the take */ ],
  "cursor": "agent",                   // agent: no cursor in the take; person: the drawn cursor shows

  "actions": [                         // steps run during the take, each at its time
    { "at": "starts", "do": "click", "target": { "role": "button", "name": "Start cycle", "exact": true } },
    { "at": { "word": "review", "nth": 2, "offset": 0.35 }, "do": "step" }
  ],
  "captions": [ { "at": "It", "text": "It starts the cycle." } ],
  "camera": [
    { "at": 0, "wide": true },
    { "at": 0.4, "focus": { "demo": "cycle-workflow" }, "pad": 40 },
    { "at": 4.4, "box": [2480, 100, 1360, 765] }
  ]
}
```

### Narration

`voice.text` is the line as the narrator reads it. `<pause S>` inserts a pause of `S` seconds; the
pipeline turns it into the TTS provider's own markup (an SSML `<break time="Ss"/>` for ElevenLabs).
Write the line so that what is said is on screen as it is said.

`leadS` leaves room before the narrator starts, for a transition or a reveal. The scene lasts
`leadS + line + tailS` unless `durS` fixes it; a `durS` shorter than `leadS + line` is an error.

### Times (`at`)

Actions, captions and camera keys each take an `at`:

- **a number**: seconds into the scene;
- **a word**: when the narrator says it (`leadS` + the word's start). Each list (actions, captions,
  camera) keeps its own position in the line: a bare word matches the first occurrence at or after
  the previous word that list named. So words read in order, and the same word can be named twice
  with different offsets;
- **`{ "word", "nth", "offset" }`**: the `nth` time it is said (1-based, counted from the start of
  the line), plus `offset` seconds (negative is allowed).

Words are compared lower-case with punctuation removed, so `"manager's"` matches `manager's,`.

### Who acts: agent or person

`cursor` sets who performs the take's actions; a step can override it with `by`.

- **`agent`**: no cursor is drawn. A `click` is dispatched on the element itself, so it also works
  on hidden or off-screen buttons. Use this when the story says the software does it.
- **`person`**: the drawn cursor glides onto the target, starting 0.55 s before the action, then
  clicks where it landed. Use this when the story says a user does it.

During off-camera `setup` and replay, a person's click lands on its target without a glide.

### Targets

| Target | Matches |
|---|---|
| `{ "css": "..." }` | a CSS selector |
| `{ "demo": "copilot-input" }` | `[data-demo-id="copilot-input"]` |
| `{ "role": "button", "name": "...", "exact": true }` | an accessible role and name (a Playwright locator) |
| `{ "text": "..." }` | an element with exactly this text |

The first match is used. A camera `focus` with `"all": true` (css only) frames the box around every
match, for example all the cards of a graph.

### Steps (`setup` and `actions`)

| `do` | Fields | What happens |
|---|---|---|
| `goto` | `path` | open the app at that path |
| `click` | `target`, `by` | person: glide on and click; agent: click the element, no cursor |
| `fill` | `target`, `text` | paste the text in one go; `${VAR}` comes from presets |
| `focus` | `target` | person: glide on and click; agent: focus the element |
| `glide` | `target` | person: move the cursor onto it |
| `step` | | dispatch `story-step` on `window`: the page plays its next held state |
| `event` | `name` | dispatch that event on `window` |
| `wait` | `s` | setup only |
| `waitUrl` | `match` | wait until the URL matches the regular expression |
| `waitFor` | `target` | wait until it is visible |
| `eval` | `fn` (`file.mjs#name`), `args` | call `fn(page, args, take)` from the project's capture code |

Every step can carry a `why`. It is printed in the take log and kept in the timing sidecar, which
makes a re-record much easier to check.

### Mocks and presets

Mocks change the capture browser only; nothing is written to the app's backend.

- `session`: sessionStorage keys set before the app boots (once per take).
- `hide`: hide elements whose text is exactly one of `text`, inside `within`.
- `replaceText`: swap a leaf element's exact text, inside `within`.
- `css`: a stylesheet added to every page.
- `script`: an init function from the project's capture code, with `args`.

The declarative mocks are reapplied on an interval, so a framework re-render cannot undo them.
A **preset** is a named bundle in code: an `init(take)` that runs before the first page loads, and
`vars` that steps can use as `${NAME}`. Use a preset when several scenes share the same dressing.

`blockWrites: true` answers every non-GET request in the capture browser with an empty `200`, except
the session refresh. Turn it on for any scene that films a real tenant and could save, publish or
run something.

### `continuesFrom`

A scene that starts where the previous one ended names it in `continuesFrom`. Before the take, the
recorder opens a fresh browser and replays the chain oldest first: each earlier scene's setup and
actions, untimed, with a short gap between steps. Mocks and presets of the whole chain apply. This
keeps every take reproducible from a cold start, while letting the film run continuously across
scene cuts. A loop in the chain is an error.

### Captions

Each caption has an `at` and a `text`, and stays up until the next caption or the end of the scene.
Captions take their word's time as is (no lead). See the reading-time rule below.

### Camera keys

The recorder films the full viewport; the compositor crops and zooms. Each key is one of:

- `{ "at", "wide": true }`: the full frame;
- `{ "at", "box": [x, y, w, h] }`: a box in clip pixels (2x CSS px), 16:9, inside the clip;
- `{ "at", "focus": <target>, "pad": 40 }`: a box measured during the take, at that key's time.
  The element's box is padded, widened to 16:9, clamped inside the viewport and converted to clip
  pixels. If it would be as large as the viewport it becomes `wide`. If the target is not on screen
  at that time, the take fails.

Prefer `focus` over a hand-measured `box`: it follows layout changes and is measured at the moment
it is used.

## The pipeline

```
recce  ->  voice  ->  plan  ->  record  ->  wire  ->  render
```

| Step | Reads | Writes |
|---|---|---|
| `recce` | the spec (no voice needed) | a screenshot of where the take would start, after replay and setup |
| `voice` | `voice` | the narrator take and its per-word times; skipped when the text is unchanged |
| `plan` | the spec and the word times | a plan file: every `at` resolved to seconds, timing rules checked |
| `record` | the plan | the clip, `<clip>.timing.json` (what ran when, measured camera boxes), a contact sheet |
| `wire` | the plan and the timing sidecar | the scene's beat in the film's project file (captions, camera keys, clip) |
| `render` | the film's project file | the rendered scene and a contact sheet; several scenes can render in parallel |

Only `plan` turns words into times. The recorder and the wiring use its seconds, so there is one
place where timing is decided. `wire` refuses a clip recorded for a different length than the plan.

### Word times

The narrator take comes from a TTS endpoint that returns per-character timings (ElevenLabs
`/v1/text-to-speech/{voice}/with-timestamps`). Characters are grouped into words. The take is then
trimmed of leading silence, so the same trimmed amount is subtracted from every word time. The result
is a list of `{ w, s, e }` in seconds on the trimmed line. Pause markup is dropped from that list.

`plan` refuses to run if the stored take was made from different text than the spec's line.

### Recording a take

The recorder (Playwright plus a CDP screencast) does this:

1. Opens headless Chrome at the viewport, with the device scale forced to 2 on the browser itself
   (without `--force-device-scale-factor=2`, headless screencast frames arrive at 1x).
2. Applies presets and mocks, replays `continuesFrom` scenes, then runs `setup`, all off camera.
3. Hides the cursor for an agent scene; parks it on screen for a person scene.
4. Resolves every action target that is already on the page: an element handle for an agent, a
   point to glide to for a person.
5. Starts the screencast and runs a timeline of glides, actions and camera measurements, each at
   its planned time. Camera measurements run alongside the actions, never in front of them.
6. Stops at the scene's length and writes a constant-rate clip in which every frame is held until
   the next frame's timestamp. The first frame also covers the time before it arrived, and the last
   frame holds until the end. A still page sends no frames, so the cursor drifts by a fraction of a
   pixel every 120 ms to keep frames coming.
7. Writes `<clip>.timing.json` with each action's planned and actual time and every camera box.

### Compositing a scene

`wire` writes the scene as a beat in the film's project file; the compositor turns beats into
video. In the reference it generates an HTML page with a GSAP timeline and renders it with
HyperFrames, then mixes and muxes the audio with ffmpeg:

- **Camera keys** become zooms on the clip: fit the box with padding, cap the scale (1.4x), and
  never zoom out past covering the frame. Moves take 0.5-0.8 s (0.65 s by default) and ease in and
  out.
- **Captions** appear at their word's time, and the build fails if one cannot be read in time.
- **The logo** is pinned in a corner between a `brandIn` and a `brandOut` anchor.
- **Music** sets where scenes end: each beat's end snaps up to the next musical beat, read from
  the track's beat file or a fallback BPM. The bed fades in and out and is ducked under the
  narrator with a sidechain compressor.
- **Narration** is placed at each line's `leadS`, mixed with the music, limited, and muxed as AAC
  onto a silent render.
- **Per-scene builds** get their own HTML, timing and mix files, so several scenes render in
  parallel; each render uses one HyperFrames worker.

## Timing rules

`plan` checks these before anything is recorded:

- **Action lead.** An action named by a word fires 0.45 s before the word, so the screen has changed
  when the word is heard. Actions at a plain number fire at that number.
- **Caption reading time.** A caption must stay up for at least `0.25 s x words + 0.6 s`. If it
  cannot, start it a little earlier; do not drop it.
- **Camera move length.** A camera move takes 0.65 s from its key's time.
- **End margin.** The last camera move must finish 0.2 s before the scene ends, because snapping the
  scene to the music beat can trim that much.
- **Nothing after the end.** No action, caption or camera key may fall after the scene's length.

## Using it today

The reference implementation is in the `ms-planning-brain` repository, under `ui/ai-pitch-video/`:

| Path | What it is |
|---|---|
| `launch/scenes/README.md` | the spec format |
| `launch/scenes/S08.json` ... `S11.json` | real scene specs |
| `scripts/scene.py` | the orchestrator: `recce`, `voice`, `plan`, `record`, `wire`, `render`, `all` |
| `scripts/narrate.py` | ElevenLabs TTS with word timestamps, silence trim, loudness normalisation |
| `capture/scene/record.mjs` | records one take from a plan |
| `capture/scene/presets.mjs` | named presets |
| `capture/real-app/lib.mjs` | the `Take` recorder: 2x CDP screencast, clock-pinned frames, drawn cursor, write blocking |
| `scripts/build-mg2.py`, `scripts/mg2.template.html` | the compositor: beats to an HTML timeline, rendered with HyperFrames |
| `scripts/mix_mg2.py` | narration and music mix (ducking, fades, limiter) and the AAC mux |
| `launch/mg2.json` (`style`, `audio`, `render`) | camera, caption, logo and audio settings; render workers |
| `.claude/skills/film-scene/SKILL.md` | the working skill for that film |

Commands, run from `ui/ai-pitch-video/`:

```bash
python3 scripts/scene.py recce 11            # where the take would start (no voice needed)
python3 scripts/scene.py voice 10            # the narrator line only: listen before recording
python3 scripts/scene.py plan 10             # resolve times and check the timing rules
python3 scripts/scene.py record 10           # plan + record the take + contact sheet
python3 scripts/scene.py wire 10             # write the beat into the film's project file
python3 scripts/scene.py render 10 11 12 --jobs 3
python3 scripts/scene.py all 10              # voice (if changed), record, wire, render
```

A real-app scene also needs `--state <storageState.json>` for the login session. The ElevenLabs
key is read from the environment and never stored.

Only the key and the film's own content (script, scenes, presets, brand assets, music) are
specific to that project. The TTS adapter, the compositor and the app's story mode are reusable,
and the [proposal](proposals/narrated-scenes-feature.md) moves them into ScreenReel. Until then,
reusing the workflow means copying the reference files above.

## Lessons learned

**Resolve targets before the take.** A role locator (`getByRole`) looked up mid-take can lag about a
second on a heavy page. The recorder looks up every target that is already on screen before the
screencast starts and acts on those handles. Prefer `demo` or `css` targets for anything that
appears during the take.

**Measure camera boxes off the action timeline.** A bounding-box measurement can be slow. Run it
alongside the actions and collect the results at the end, so a slow measurement never delays a
click.

**On heavy pages, make cursor glides clock-based.** A glide that takes a fixed number of mouse moves
runs long when each move is slow. Ease by elapsed wall-clock time instead: a slow page then gets
fewer steps, not a longer glide.

**Space app state steps at least 0.4 s apart.** Two state changes closer than that can land in the
same render, and one of them is never seen on screen.

**Let the app hold scripted state; let the film decide timing.** For anything the real app cannot do
on cue (an AI building a graph, a run finishing), give the app a story mode that prepares each frame
and holds it until it receives a window event such as `story-step`. The scene then fires `step` on
the word it belongs to. The app owns what each frame looks like; the scene owns when it appears.
This is the same idea as ScreenReel itself, and the proposal makes it a ScreenReel contract rather
than something each app invents.

**Pin the clip to the take's clock.** A still page sends no screencast frames. Without back-filling
the first frame and holding the last one to the scene's end, the clip comes out shorter than planned
and everything after drifts.

**Voice first, and let the person who owns the film listen.** Changing a word changes every time
after it. Generate the line, let them hear it, and only then record. `plan` refuses a take of
different text, so a stale take cannot slip through.

**Dress the app in the capture browser only.** Find elements by their exact text, then change the
text, hide the original, or insert a sibling. Reapply on an interval (about every 40-60 ms) so a
framework re-render does not undo it. Do not replace the inner HTML of an element the app still
reads (drag sources, inputs, graph nodes): hide it and add your own element beside it.

**When the real flow cannot run, draw it** using the app's own classes, and reveal it step by step
with the same `step` events.

**Block writes on real tenants.** Any scene that could save, publish or run should set
`blockWrites`. Intercept clicks that would act on the tenant with a capture-phase listener.

**Keep stills with the project.** Recce shots and contact sheets live in the project (for example
`stills/scenes/`), not a temp directory, so later work can reuse them. Look at the contact sheet of
every take before wiring it.

**Smaller gotchas:**

- In page scripts written as JavaScript template literals, write `\\s`, `\\d`, `\\.`; a single
  backslash is eaten.
- HTML5 drag and drop only works through `locator.dragTo`; raw mouse moves do not trigger it. Prefer
  drawing the result.
- A TTS model that reads bracketed tags (`[excited]`) aloud is worse than none; use SSML breaks and
  capitals for stress.
- A login refresh token can be single-use. Open every take from the saved storage state and save it
  back on close; do not load the app in another browser in between.
- Parallel render workers in the compositor left a white band over the bottom of the frame; one
  worker rendered clean.
