# Voiceover

**What it does:** narrates the captured video by speaking each scene's talking points. The script is
text you already wrote for the presenter notes — you don't author anything new.

Live demo: [Chapter 3 of the showcase](../examples/action-showcase/showcase-voice.html).

## Quickest path (macOS)

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
