# Future planned task: browser-local recorded narration

> Status: planned only. This document does not describe an implemented feature.

## Goal

Enable the disabled **Record my narration while I go** option in ScreenReel Studio. An author can
optionally record microphone audio while recording product interactions, save that audio only in
the current browser, and hear it in sync when Projector replays the demo.

This is deliberately an MVP. It must not add a backend, transcription service, external media
service, or new runtime dependency.

## MVP experience

- Every **Record** or **Record more** action opens recording options so microphone use is explicit
  for each take. Narration recording is off by default.
- When narration is selected, Studio requests microphone permission and records audio alongside
  the normal action recorder.
- Each recording session creates one audio segment anchored to the actions captured in that take.
  This allows a scene to be built across multiple **Record more** sessions without replacing prior
  narration.
- Review shows lightweight narration information: take count, duration, playback, delete, and
  re-record. A waveform editor is not required.
- Projector starts each audio segment at its recorded action boundary, preserves its lead-in, and
  waits for its trailing audio before continuing.
- Recorded audio replaces generated narration only for the actions covered by that segment. Text
  narration continues to work elsewhere and remains the source used by CLI video voiceover.
- Projector mute, pause, scene changes, and teardown stop local audio just as they stop existing
  live narration.

If microphone access is unavailable or denied, Studio must explain the problem and allow the
author to continue with action-only recording.

## Local storage and privacy

- Store audio blobs and synchronization metadata in project-scoped IndexedDB. Do not put blobs in
  localStorage or the flow manifest.
- Namespace every read, write, and delete by `projectId`, `flowId`, and `sceneId`; cross-project
  access is a critical defect.
- Store only the minimum metadata needed for playback: MIME type, duration, lead-in, action anchor,
  covered action IDs, creation time, and synchronization signature.
- Stop all microphone tracks after success, cancellation, permission failure, recording failure,
  Studio close, or page teardown.
- Recording and playback must make no off-origin network request.
- Deleting a scene or flow, or clearing ScreenReel project data, removes its local narration.

The existing JSON export/import format remains unchanged. Exported flows, imported flows, and
duplicated flows do not carry browser-local narration in this MVP.

## Synchronization rules

- Reuse the recorder's measured action timing and pauses as the visual pacing source.
- Record the delay between audio start and the first captured action as the segment lead-in.
- At playback, begin the segment at its anchor, wait for the lead-in, execute its covered actions,
  and wait for any remaining audio before moving beyond the segment.
- Compute a deterministic signature from the segment's action boundary, covered action order, and
  playback-relevant action values.
- If an action is inserted, removed, reordered, or edited in a way that invalidates the signature,
  mark the segment **Re-record required** and do not play it. Never silently play known-out-of-sync
  audio.
- Disable **Undo last** during a narrated take. Removing an interaction while continuous audio is
  still being recorded would make the remaining segment timing ambiguous.
- Discard a narrated take containing no captured action with a clear message. Narration-only scenes
  continue to use the existing scene Voice field for this MVP.

## Compatibility boundaries

- Do not change the public manifest schema or Projector API.
- Do not add recorded audio to JSON export/import, flow duplication, CLI capture, or rendered MP4
  assembly.
- Do not add transcription, waveform editing, trimming, noise removal, voice-activity detection,
  cloud storage, sharing, or collaboration.
- Do not support one recorded segment across a full-page navigation. Authors should keep the
  existing scene boundary at navigation.
- Preserve existing text narration, action pacing, browser speech synthesis, and captured
  voiceover behavior for flows without local audio.

## Focused tests

Add isolated tests for:

- media-recorder startup, permission failure, cancellation, idempotent stop, and track cleanup;
- segment anchoring, lead-in and tail planning, multiple sequential takes, and empty takes;
- deterministic synchronization signatures and stale-segment detection;
- project isolation plus scene, flow, and project-scoped deletion;
- Projector precedence between recorded audio and existing generated narration;
- mute, pause, navigation, and teardown releasing playback resources.

## Action-showcase verification

Extend the existing browser smoke using deterministic fake microphone and media APIs:

1. Open Studio in the action-showcase and choose narration for a take.
2. Capture normal product interactions and stop the take.
3. Confirm a non-empty blob is stored only in the action-showcase project namespace.
4. Confirm Review reports a fresh local narration segment.
5. Play the scene and verify the segment starts at its action boundary without duplicate generated
   narration.
6. Verify mute and pause stop audio, and that playback waits for the segment tail.
7. Make a synchronization-relevant action edit and confirm the segment becomes **Re-record
   required** and is no longer played.
8. Assert recording and playback make no off-origin requests.

Before considering the task complete, rebuild the checked-in browser assets and run:

```bash
pnpm test
pnpm run test:browser
git diff --check
pnpm pack --dry-run
```

Do not fix unrelated failures as part of this task. Record them separately and report the exact
failing stage.
