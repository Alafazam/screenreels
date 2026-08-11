# Voiceover

**What it does:** speaks each scene's talking points — out loud in the live tour, and into the
rendered video. The script is text you already wrote for the presenter notes; you don't author
anything new.

Live demo: [Chapter 3 of the showcase](../examples/action-showcase/showcase-voice.html).

## Two places it speaks

Narration happens twice, from the same field, because the two run in different worlds:

| | Live narration | Captured voiceover |
|---|---|---|
| Runs in | The viewer's browser, during playback | Your machine, at render time |
| Engine | Web Speech API (`speechSynthesis`) | macOS `say`, or any TTS command |
| Produces | Audio in the tab, every time it plays | An AAC track muxed into the MP4 |
| Turn on with | On by default; speaker button in the pill | `--voice` or `voice.enabled` |
| Overrun handling | Holds the scene until the sentence ends | Freezes the last frame (`overflow`) |

Neither can do the other's job: there is no ffmpeg in a browser, and no `speechSynthesis` in Node.
So both exist, and both speak the same transcript: the scene's own line
(`scene.narration ?? scene.talkingPoints`) followed by one line per action that has a `narration`.
`ScreenReelCore.narrationScript` and `narrationText` in `lib/voice.mjs` are pinned against each other
by `test/narrator.test.mjs`, so the two can never drift into speaking different words for the same
scene. Only the timing differs, by design: live, the scene line plays as the scene opens and each
action line as that action runs; captured, the whole transcript plays over the scene's clip.

## Live narration

On by default. The presenter pill and the share-mode viewer chrome both get a speaker button; muting
persists per project and survives the flow's own navigations.

```js
await ScreenReel.mount(button, {
  projectId: 'acme-sales',
  flow: { src: '/demos/sales-demo.json' },
  narration: true,                                  // default; false to disable entirely
  // narration: { rate: 0.9, voiceName: 'Samantha', lang: 'en-GB' },
});
```

Variables are interpolated first, so a personalized share link is *heard* saying the prospect's name:
`?srv_company=Northstar%20Retail` makes `{{company}} resolves from the share link` come out as
"Northstar Retail resolves from the share link".

When a scene's actions finish while narration is still talking, playback waits for the sentence to
end rather than cutting it off — capped at 6 seconds so one long note can't stall the tour. Override
per scene with `narrationCapMs`.

Three things to know:

- **Autoplay policy.** Browsers block audio until the viewer interacts with the page. Starting the
  tour from a button is itself that interaction, so the normal path is fine. A `?demo=play` share
  link auto-plays with no gesture, so narration may be refused — the pill then pulses the speaker
  button and toasts once, and tapping it both grants the gesture and speaks the current scene.
- **Voices are not guaranteed.** Linux Chrome often ships none, in which case the speaker button is
  hidden rather than offering silence.
- **Capture is unaffected.** Capture injects the action runtime and cursor but not Projector, so live
  narration cannot leak into a recording or double up with `--voice`.

## Quickest path for video (macOS)

```bash
npx screenreel record --voice
```

That's it. Every scene with `talkingPoints` gets narrated using the built-in `say` voice; scenes
without get silence. No account, no API key, works offline.

## Where the words come from

```
scene.narration  ??  scene.talkingPoints
```

`talkingPoints` is the default because it already exists on your scenes. Add `narration` when the
spoken script should differ from the presenter's on-screen notes — written notes can be terse
bullets, while spoken narration wants full sentences:

```json
{
  "id": "overview",
  "talkingPoints": "KPIs first — revenue, margin, sell-through.",
  "narration": "We start with the numbers that matter: revenue, gross margin, and sell-through."
}
```

An empty or whitespace-only script means a silent scene. That's not an error.

### Per-action lines

An action can carry its own `narration`, spoken as that action runs — so the words land on the
highlight, click, or scroll they describe instead of arriving as one paragraph up front:

```json
{
  "id": "overview",
  "talkingPoints": "KPIs first.",
  "actions": [
    { "type": "highlight", "selector": "[data-kpi=revenue]", "narration": "Revenue leads the row." },
    { "type": "click", "selector": "#margin-tab", "narration": "Margin lives one tab over." }
  ]
}
```

Live, each line *replaces* whatever is still speaking: a queue would drift behind the picture, and
the point is that the words match what is on screen. In a captured video there is no per-action audio
timeline, so the lines are joined onto the scene's line and spoken over the clip. Studio shows a
speaker badge on narrated actions in the timeline, and the scene Settings modal can preview a scene's
line through the same engine a viewer hears. Variables are interpolated in action lines too.

## Choosing a voice engine

Configure in `screenreel.config.mjs`:

```js
voice: {
  enabled: true,          // or pass --voice on the CLI
  provider: 'say',        // default
  voiceName: 'Samantha',  // optional: `say -v ?` lists installed voices
  rate: 180,              // optional: words per minute
  overflow: 'extend',
}
```

### Any TTS command line

`provider: 'command'` runs a template with two placeholders — `{textFile}` (where ScreenReel wrote
the script) and `{outFile}` (where your engine should write audio). Output format doesn't matter;
it's transcoded for you.

```js
voice: { enabled: true, provider: 'command', command: 'espeak -f {textFile} -w {outFile}' }
voice: { enabled: true, provider: 'command', command: 'piper --model en_US.onnx -f {textFile} -f {outFile}' }
```

This is also how you use a cloud voice — point it at that provider's CLI. The key stays in your
environment; ScreenReel never sees it.

### Your own engine

The config is real JavaScript, so a provider can be an object:

```js
voice: {
  enabled: true,
  provider: {
    name: 'my-tts',
    available: () => ({ ok: !!process.env.MY_TTS_KEY, reason: 'set MY_TTS_KEY' }),
    async synthesize(text, outFile) {
      const audio = await myTts.speak(text);
      await fs.promises.writeFile(outFile, audio);
    },
  },
}
```

## When narration is longer than its clip

A 12-second script over an 8-second scene has to give somewhere:

- **`overflow: 'extend'`** (default) — freezes the last frame until the narration finishes. Nothing
  is cut. You get a warning naming the scene and the overrun.
- **`overflow: 'truncate'`** — keeps the clip length and cuts the audio short.

The better fix is usually to give the scene more room: raise its `dwellMs`/`tailMs`, or slow the
whole demo with [`timeScale`](pacing-and-cursor.md).

## Verifying the result

```bash
ffprobe -v error -select_streams a -show_entries stream=codec_name,channels,sample_rate \
  -of csv=p=0 screenreel-output/reel.mp4
# aac,2,48000
```

With voice **off**, the output has zero audio streams — identical to before this feature existed.
That's regression-locked by a test, so enabling voice can never silently change your existing
pipeline.

## Troubleshooting

**"voice provider 'say' is unavailable: … needs macOS"** — you're on Linux/Windows. Use
`provider: 'command'` with espeak, piper, or any CLI. This is a hard error by design: a
half-narrated reel is worse than a clear failure.

**"voice.command did not write …"** — your template didn't produce a file at `{outFile}`. Check the
placeholder is present and the command actually writes to that path.

**Audio drifts out of sync** — it shouldn't; every stitched segment carries an identical AAC 48 kHz
stereo track (silence where there's no narration), and assemble refuses to stitch if any part's
audio shape is wrong. If you hit this, the per-part assertion message names the offending file.

## Under the hood

Concat's classic failure is mixing audio-bearing and audio-less parts, so
[`lib/assemble.mjs`](../lib/assemble.mjs) gives **every** part — title cards included — the same
audio shape before stitching, and stream-copies the video (clips are all-intra, so the copy is
exact). Providers live in [`lib/voice.mjs`](../lib/voice.mjs); duration measurement uses ffprobe via
[`lib/media.mjs`](../lib/media.mjs).
