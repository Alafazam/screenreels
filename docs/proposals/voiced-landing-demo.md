# Proposal: an ElevenLabs voice for the landing-page demo

> Status: phase 1 (the live tour) is built. Decisions taken: one voice track for both variants;
> Autoplay is the default (first in the chooser) and Guided stays; voice Matilda with
> `eleven_multilingual_v2` on the free ElevenLabs plan; key in `ELEVENLABS_API_KEY`. The generator
> is `scripts/voice-render.mjs` (generic, driven by a voice plan file), not `voice-landing.mjs`.
> The doctor command on the Demo Lab page is fixed. Phase 2 (captured video) is still open.

## Summary

The landing page's "Run the live demo" tour plays muted today (`narration: false` in
`examples/action-showcase/tour-options.js`), because the browser's speech voice sounds bad. Since
0.4.0, the Projector can play pre-recorded audio files on timed info cards (`stepMs`, `atMs`,
`narrationAudio`; see [playback.md](../playback.md#timed-steps-and-narration-audio)). The landing
tour does not use that yet.

The plan:

1. Write one line of narration per info card (8 cards, about 70 s in total).
2. Generate each line once with ElevenLabs, with word timestamps. Do this at authoring time,
   with the key from your environment.
3. Commit the MP3 files next to the flow. The Pages build copies them, and the visitor's browser
   plays them. No key or API call reaches the visitor.
4. Time each card's actions to the words with `atMs`. A small script writes `stepMs`, `atMs` and
   `narrationAudio` into `screenreel.demo.json` from the timestamps.

The live tour is phase 1. The captured MP4 is phase 2, because Capture does not play timed steps
or audio files yet (see [Captured video](#captured-video-phase-2)).

## Inventory: what the landing page is today

### Landing versions in the git history

| When | Commits | What it was |
|---|---|---|
| 2026-07-23 | `6b40cd0`, `fa3baaa` | First Pages launch. SEO, logo, and a "cinematic" guided tour (countdown, wordplay actions). |
| 2026-07-30 | `f3c9659`, `fd68964` | Agent cursor added and the tour re-cut. A seven-page "journey of a demo" showcase (`showcase*.html`) was added. |
| 2026-08-10 | `4701d0b`, `60b14d7`, `59729f2` | Page retold around self-repair ("Record it once. It repairs itself."), six feature cards, a "Hear a narrated line" button, and live tour narration with browser speech. |
| 2026-09-30 | `52555bc` | **The current page.** Redesign with two hero variants, the Demo Lab fixture pages, and the six-scene dogfood flow. |
| 2026-09-30 | `b2bd1c5`, `e7c3cc9`, `006a122`, `7deb238` | Tour moved to the guide player: Guided/Autoplay chooser, one card per scene, return to start on exit, and **narration muted**. |
| 2026-10 | `be5d968`, `dc4f8c2` | Runtime only: timed steps and the audio-file narrator. The landing does not use them yet. |

### What is live now

- **One page, two hero variants.** `index.html` has two hero panels. `app.js` shows one:
  - `repo-native` (default): "A demo recorder that ships with your product.", a JSON code window,
    a mini product, Studio and a commit line. Button: **Run the live demo**.
  - `product-in-product`: "Record product demos that live inside your product.", with Studio over
    a product screen. Button: **Watch the live demo**.

  Random allocation is off (`LANDING_ALLOCATION_ENABLED = false`). All visitors see `repo-native`
  unless the URL has `?variant=product-in-product`. A query override is never stored. The
  conversion events (`live_demo_start`, `demo_progress_50`, `demo_complete`, ...) go to a
  provider-neutral `screenreel:landing-conversion` window event. No analytics provider is
  connected.
- **The sections under the hero** are the same for both variants: three outputs, "Why
  ScreenReel", the Demo Lab teaser, a runtime playground (KPIs, form, navigation card) and the
  install block.
- **The live demo** is flow `guided-tour`, "ScreenReel in 90 seconds", in `screenreel.demo.json`.
  It has six scenes across three pages (landing → `demo-lab.html` → `demo-lab-output.html` →
  landing). The visitor picks Guided (a card per step, Next) or Autoplay (a compact bar). Both
  variants play the same flow. Only the scene 1 and 6 selectors use `:not([hidden])` to find the
  visible hero.
- **Other flows and pages that are deployed but are not the landing demo:**
  - flow `action-showcase` (every action type, used by CLI tests and capture);
  - the seven-page showcase journey (`showcase.html`, `showcase.demo.json`, narration off), which
    is linked only from the Demo Lab's flow-doctor link and page footers;
  - `STORYBOARD-author-by-doing.md`, notes for a five-scene `author-by-doing` flow that was never
    built.
- **`docs/landing-demo-recording-worksheet.md`** is the scene contract for the six-scene flow. Its
  last replay ran 45 s with speech stubbed, against a 90 s target, and says to "time it with real
  narration before retuning `dwellMs`". This plan does that.

### The six scenes today

| # | Page | Cards (info cards) | Other actions | Current `narration` (not heard; muted) |
|---|---|---|---|---|
| 1 | landing | badge; hero statement | pointer to Demo Lab link, goto | "ScreenReel is an open-source demo recorder that ships with your product. …" |
| 2 | Demo Lab | pacing slider (last action) | type name, set audience, toggle notes, move pacing | "Open Studio, press record, and use your app normally. …" |
| 3 | Demo Lab | result preview (third action) | drag scene 03, highlight scene 01, pointer to Generate, goto | "When a moment needs emphasis, point at the real element …" |
| 4 | Outputs | live output; readable flow | glow sequence over the three output cards | "That one flow now plays live inside the product, …" |
| 5 | Outputs | doctor output | scroll to maintenance, goto | "When the product changes, validation catches broken targets, …" |
| 6 | landing | hero actions | pointer to Star on GitHub | "Everything stays in your stack. Watch the live demo, …" |

## What exists for voice, and what each path can do

| Path | Engine | Reads | Timed to words? | Status |
|---|---|---|---|---|
| Live tour, browser speech | `speechSynthesis` | `scene.narration`, `action.narration` | No | Built; landing has it off |
| Live tour, audio files | `<audio>` per info card | callout `narrationAudio`, `stepMs`, `atMs` | Yes, through `atMs` | Built in 0.4.0; **this plan uses it** |
| Capture `--voice` | `say`, any CLI, or a JS provider | `narrationText(scene)` | No: one track per scene over the clip | Built |
| Narrated scenes | ElevenLabs with timestamps, Playwright, HyperFrames | per-scene spec | Yes | Reference scripts in another repo; proposal only |
| `screenreel voice render` | pluggable | flow | — | Roadmap only |

Facts that shape the plan:

- `narration: false` on the mount turns off **all** narration, files too. The landing must change
  to `narration: { speech: false }`: files play, and the browser never speaks.
- `narrationAudio` works only on a `callout`. One file per card. A scene with two cards gets two
  files.
- A timed step is a card plus the actions after it that have `atMs`. The first action without
  `atMs` (for example `goto`) is a gate: the step plays to its end, then the gate runs. So each
  scene must **start with its card**, and the actions that the line describes must follow it.
  Scenes 2 and 3 have the card at the end or in the middle today, so they must be reordered.
- `stepMs` and `atMs` are wall-clock times from the moment the card shows. A late action runs at
  once, and lateness does not add up.
- In **Guided** mode the card plays its file while it waits for Next, and the actions run **after**
  Next (`atMs` is ignored). A line such as "watch it type the name" then plays before the typing.
  See [Decisions](#decisions).
- Capture (`lib/`, `packages/capture`) does not read `stepMs`, `atMs` or `narrationAudio`. It runs
  actions one after another and lays one voice track over each scene.
- `scripts/build-pages.mjs` copies an **explicit list** of files to `_site/`. A new `audio/`
  folder is not deployed unless the script copies it.

## Decisions

1. **Which variant.** Recommendation: one voice track for both. The tour is the same flow on both
   variants, and the lines below do not quote either headline. Variant-specific audio would need
   two flows or per-variant files. That adds work for an experiment that has no allocation turned
   on.
2. **Guided mode.** The voice describes actions as they happen. In Guided, the actions run after
   Next. Options:
   - **A (recommended):** make the voiced tour Autoplay by default and keep Guided in the chooser.
     Guided plays each line on its card. Write the lines so they still make sense before the
     action ("Next, it names the demo …" is not needed; present tense works).
   - B: offer Autoplay only (chooser off) for the voiced tour.
   - C: Guided stays silent (needs a small runtime option; not available today).
3. **Voice and model.** Pick an ElevenLabs voice ID. Recommendation: `eleven_multilingual_v2` for
   quality, output `mp3_44100_128`. The whole script is about 1,000 characters, so the cost per
   full generation is very small.
4. **Generator home.** Recommendation: a project script, `scripts/voice-landing.mjs`, used only
   for this landing. Promote it to `screenreel voice render` later, when a second user needs it.
5. **Video.** Phase 2 or not at all (see [Captured video](#captured-video-phase-2)).
6. **Environment variable name** for the key. Proposed: `ELEVENLABS_API_KEY`.

## Draft narration script

Each line belongs to one info card. **Bold** words are anchors: the action fires 0.45 s before the
word (the narrated-scenes timing rule). The times are estimates at about 2.6 words per second,
and the real values come from the timestamps.

The lines describe only what is on screen. Note that the Demo Lab is a test page that the tour
drives. Studio does not record on screen in this tour, so the lines do not say "press record".

| Step | Page | Card target | Line | Anchored actions | Est. |
|---|---|---|---|---|---:|
| 1a | landing | `open-source-badge` | "ScreenReel is a free, open-source demo recorder. Apache 2.0. No account, no backend, nothing hosted for you to trust." | — | 7 s |
| 1b | landing | `hero-statement` | "You record a walkthrough once, keep it as a file in your repository, and play it inside your own product. Let's **build** one." | pointer to `demo-lab-link` on "build"; then `goto` (gate) | 8 s |
| 2 | Demo Lab | Demo brief card (new target, see code changes) | "This is the Demo Lab, a small test app. ScreenReel **names** the demo, picks an **audience**, turns on presenter **notes**, and sets the **pace**. Each move is a real browser event, and Studio saves each one as an action you can edit." | type on "names", set on "audience", toggle on "notes", lever on "pace" | 13 s |
| 3 | Demo Lab | `result-preview` | "**Drag** a scene to change the order. To show something without clicking it, **point** at the real element. That becomes a highlight in the flow. Then **generate** the outputs." | drag on "Drag", highlight `scene-01` on "point", pointer to Generate on "generate"; then `goto` (gate) | 11 s |
| 4a | Outputs | `live-output` | "One flow, three outputs. It plays **live** inside your product, opens as a self-playing **link**, and renders to **video**." | highlight each output card on its word (replaces the fixed-rate glow sequence) | 7 s |
| 4b | Outputs | `readable-flow` | "All three come from the same JSON file, which you review and version next to your code." | — | 5 s |
| 5 | Outputs | `doctor-output` | "When your product changes, flow doctor checks every target and repairs the selectors that moved, before a customer sees a broken demo." | `scrollIntoView` maintenance at `atMs: 0`; then `goto` (gate) | 8 s |
| 6 | landing | `hero-actions` | "That was ScreenReel playing itself. Read every line on **GitHub**, and put it in your own product." | pointer to `github-star` on "GitHub" | 6 s |

Estimated total: about 65 s of voice, plus page loads. That is under the 90 s worksheet target.

The current scene 6 line ("Watch the live demo") is wrong in context, because the visitor is
watching it. The new line fixes that.

## How the audio is generated

A new script, `scripts/voice-landing.mjs`, Node only, no new dependency:

1. Read the flow. For each card that has `narration` and an entry in the voice plan (below), take
   the card's `narration` as the line. The flow is the one place for the words.
2. Skip a line whose text hash matches its stored `.words.json`. A changed word regenerates only
   that line.
3. Call `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/with-timestamps` with
   `model_id`, `voice_settings` and `output_format=mp3_44100_128`. Send the key in the
   `xi-api-key` header, from `process.env.ELEVENLABS_API_KEY`. The script never prints, logs or
   writes the key, and it fails loudly with "set ELEVENLABS_API_KEY" when it is missing. Pass
   `previous_text` and `next_text` so lines in a row keep the same tone.
4. Decode `audio_base64`. Group `alignment` characters into words `{ w, s, e }` in seconds.
5. With ffmpeg (already a dependency of Capture), trim leading silence, subtract the trimmed time
   from every word, and normalise loudness (for example `loudnorm` to −16 LUFS).
6. Write `audio/landing/<step>.<hash8>.mp3` and `<step>.words.json` (text hash, voice, model, words).
7. Compute the timeline (a pure function, unit-tested):
   - `stepMs = LEAD_MS + duration + TAIL_MS` (proposed 300 ms and 700 ms, as named constants);
   - for each anchor: `atMs = LEAD_MS + word.s × 1000 − ACTION_LEAD_MS (450) + offset`, not below
     0, and not earlier than the action before it;
   - fail if an anchor word is not in the line, or if an `atMs` falls after `stepMs`.
8. Write `stepMs`, `narrationAudio` and each anchored action's `atMs` into `screenreel.demo.json`.
   Write nothing else.
9. Run `flow validate`. It already checks `stepMs`, `atMs` order, and `narrationAudio` placement.

`--dry-run` prints the plan (lines, character count, which lines are stale) and calls nothing.
`--only 2` regenerates one step.

The **voice plan** (`examples/action-showcase/audio/landing/voice-plan.json`) holds what the flow
schema has no field for: the voice ID, the model, and the anchors
(`{ "card": "author-the-story-callout", "anchors": [{ "action": "name-type", "word": "names" }] }`).
The anchored actions get stable `id`s in the flow. The text stays only in the flow.

## Where the files live and how Pages serves them

- Source: `examples/action-showcase/audio/landing/*.mp3` plus `*.words.json` and
  `voice-plan.json`. All are committed. The MP3s are about 1 MB in total.
- Flow URLs are relative, for example `"narrationAudio": "audio/landing/2.ab12cd34.mp3"`. The
  Projector resolves them against the page, and all three tour pages are in the same folder.
- `scripts/build-pages.mjs`: copy `audio/landing/*.mp3` (not the JSON sidecars) to `_site/`. Then
  fail the build if any `narrationAudio` in `screenreel.demo.json` has no file in `_site/`.
- Cache: the build does not add `?v=` to URLs inside the flow JSON. A content hash in the file
  name does the same job, so a regenerated line gets a new URL and the CDN never serves an old
  take.
- No key, API call or backend is involved at visit time.

## How actions and cards are timed to the voice

- Each scene starts with its card. The card shows, the clock starts, and the file plays.
- Anchored actions run at their `atMs`. Actions that the line does not name get a fixed `atMs` from
  the voice plan (for example `scrollIntoView` at 0).
- `goto` stays without `atMs`, so it is a gate: the step plays out, then the tour moves to the next
  page.
- The card stays up for the whole step, and the page is not dimmed while the step's actions run
  (existing runtime rules).
- Action durations must fit between anchors: `type` (about 0.85 s at `charMs: 35`), `lever`
  (0.9 s), `drag` (0.85 s). The generator warns when the gap to the next anchor is shorter than the
  action's own duration.
- Check drift with the existing `screenreel:step` event (`elapsedMs − atMs`). Check the full run
  with the headless `flow test`, not the in-app browser pane (it slows hidden-tab animation).
- **Autoplay policy risk.** The tour starts from a click, so audio on the landing is allowed.
  Scenes 2–5 are on other pages after a full navigation. Chrome normally allows sound after the
  visitor has interacted with the site, but Safari may block it. When audio is blocked, the
  Projector already pulses the speaker button and shows a toast once. Test both browsers before
  release.

## Code changes

| File | Change |
|---|---|
| `scripts/voice-landing.mjs` | New: generator (above). Pure timing function in its own module. |
| `test/voice-landing.test.mjs` | New: words-from-alignment, silence offset, `atMs` from anchors, missing-word and past-`stepMs` errors. No network. |
| `examples/action-showcase/screenreel.demo.json` | `guided-tour` only: move each card to the front of its scene; ids on anchored actions; per-card `narration`; replace the scene 4 glow sequence with three highlights; then generated `stepMs`, `atMs`, `narrationAudio`. Set scene `narration` to `""` so Capture does not read the old line twice. |
| `examples/action-showcase/demo-lab.html` | Add `data-demo-id="demo-brief"` to the Demo brief card, as the scene 2 card target. |
| `examples/action-showcase/tour-options.js` | `narration: false` → `narration: { speech: false }`. Default mode per [Decisions](#decisions) 2. |
| `scripts/build-pages.mjs` | Copy the audio files; fail on a missing `narrationAudio` file. |
| `scripts/browser-smoke.mjs` | Landing contract: the first card requests its audio URL with status 200, and mute keeps the timeline. |
| Docs | Update the recording worksheet (new lines, timings). Mark the roadmap item partly done. Add the generator to `voiceover.md`. |

To check before building: the pill's `sound` button shows "only when narration is on and the
browser can speak". Confirm that it also shows for file-only narration (`speech: false`). If it
does not, that is one more small runtime fix.

## Captured video (phase 2)

Capture runs actions in sequence, ignores `atMs` and `stepMs`, and speaks
`narrationText(scene)` through a voice provider. Two ways to reuse the same takes:

- **Small, no core change:** a custom `voice.provider` in `screenreel.config.mjs` that looks up
  the committed MP3s for a scene and joins them, instead of calling ElevenLabs again. The words
  match, but the clicks do not land on the words, because Capture's pacing is sequential.
- **Correct:** teach Capture to play timed steps (the roadmap item "Capture reads a flow's playback
  mode") and lay each card's file at its step start. This is a real feature with its own tests.

Recommendation: ship the live tour first. Decide on the video after you hear the live result.

## Open questions

1. One voice track for both variants: yes or no?
2. Guided mode: option A, B or C?
3. Which ElevenLabs voice (ID or name), and which model?
4. The key's environment variable name. Is it `ELEVENLABS_API_KEY`?
5. Do the eight lines say what you want? Should the tone be more product-led or more developer-led?
6. Should the captured MP4 get the voice now, or later?
7. Out of scope, but noticed: the Demo Lab output page shows `$ pnpm screenreel doctor`, but the
   real command is `screenreel flow doctor`. Fix it in the same change, or separately?

## Order of work after approval

1. You approve the decisions and the lines.
2. Build the generator and its tests. Run `--dry-run`.
3. Generate the audio for **one** step (scene 2). You listen. Then generate the rest.
4. Restructure the flow, wire `tour-options.js` and the Pages build, and run `pnpm test`,
   `pnpm run test:browser`, `flow validate`, the headless `flow test`, and `pnpm build:pages`.
5. Open a PR from a feature branch. Never push to `main` directly, because `main` deploys the live site.
