# Roadmap

Planned work, not yet built. Nothing here is available in a release.

## Pre-recorded AI-voice narration

Live narration today uses the browser's built-in speech, which sounds robotic on most systems. The
landing tour therefore ships muted. The plan: the author generates narration once, in Studio or
through the CLI, with a high-quality AI voice, and ships the audio with the flow.

- **Where it runs:** at authoring time only. A ScreenReel demo plays in the viewer's browser with
  no backend, so a live cloud voice would put an API key in every visitor's browser. Pre-rendered
  audio avoids that, sounds the same on every play, works offline, and can be reused for the
  captured video's voiceover.
- **Flow shape:** each scene (and action with its own line) can reference a rendered audio file
  next to its `narration` text. Projector plays the file instead of speaking the text, keeping
  mute, pause, and scene-change behaviour; the text remains the fallback and the video script.
- **Authoring:** Studio gets a "Generate narration" step, and the CLI gets
  `screenreel voice render`. Both go through a pluggable voice provider, like Capture's existing
  `command` provider. Candidates: ElevenLabs (highest quality), OpenAI `gpt-4o-mini-tts`, Google
  Gemini TTS, or local and free with Kokoro. The author supplies their own API key through the
  environment; nothing is stored in the flow.
- **Editing:** a regenerated line replaces only that line's file, so an author can fix one
  sentence without re-rendering the tour.

Related: [browser-local recorded narration](future-local-recorded-narration.md), for authors who
want to record their own voice with the microphone instead.

## Also planned

- Split `screenreel.d.ts` so the global `Window.ScreenReel` augmentation is opt-in.
- Scenes without a `route`, for shell-wide guides that play on whatever page is open.
