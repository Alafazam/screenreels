// Plans a scene's audio track from its info cards' narration files: where each file starts in the
// clip, where a file is cut because the next card's file starts, and what to do when the voice
// outlasts the clip. Pure, so test/narration-track.test.mjs covers every rule; lib/assemble.mjs
// turns the plan into one ffmpeg call. The rules follow the live tour (docs/playback.md, "Timed
// steps and narration audio"): a card's file starts when the card shows, and the next card's file
// replaces it.

/* Capture writes `<clips>/<scene id>.narration.json` next to a clip whose cards have narration
   files: { sceneId, steps: [{ card, file, durationMs, offsetMs }] }. */
export const NARRATION_SIDECAR_SUFFIX = '.narration.json';

/* steps:    [{ file, offsetMs, durationMs, card }] — offsetMs is the card's show time in the clip.
   clipMs:   the clip's length.
   overflow: 'extend' (freeze the last frame until the voice ends) or 'truncate' (cut the voice).
   Returns { segments: [{ file, delayMs, durationMs }], lengthMs, extendMs, warnings }. */
export function planNarrationTrack({ steps = [], clipMs, overflow = 'extend' }) {
  if (!(clipMs > 0)) throw new Error(`clipMs must be a positive number, got ${clipMs}`);
  if (overflow !== 'extend' && overflow !== 'truncate') throw new Error(`overflow must be 'extend' or 'truncate', got ${overflow}`);
  const warnings = [];
  const ordered = steps
    .map((step) => {
      if (!step.file) throw new Error(`a narration step for card ${step.card ?? '?'} has no file`);
      if (!(step.durationMs > 0)) throw new Error(`narration file ${step.file} has no length`);
      return { ...step, offsetMs: Math.max(0, Math.round(step.offsetMs)) };
    })
    .sort((a, b) => a.offsetMs - b.offsetMs);

  const segments = ordered.map((step, index) => {
    const next = ordered[index + 1];
    let durationMs = Math.round(step.durationMs);
    if (next && step.offsetMs + durationMs > next.offsetMs) {
      const cutMs = step.offsetMs + durationMs - next.offsetMs;
      warnings.push(`card ${step.card ?? index}: its narration runs ${cutMs} ms into the next card's, so it is cut where the next card starts`);
      durationMs = next.offsetMs - step.offsetMs;
    }
    return { file: step.file, delayMs: step.offsetMs, durationMs };
  }).filter((segment) => segment.durationMs > 0);

  const voiceEndMs = segments.reduce((end, segment) => Math.max(end, segment.delayMs + segment.durationMs), 0);
  const overrunMs = Math.max(0, voiceEndMs - Math.round(clipMs));
  if (!overrunMs) return { segments, lengthMs: Math.round(clipMs), extendMs: 0, warnings };

  if (overflow === 'extend') {
    warnings.push(`the narration ends ${overrunMs} ms after the clip, so the last frame is held (voice.overflow: 'extend')`);
    return { segments, lengthMs: voiceEndMs, extendMs: overrunMs, warnings };
  }
  warnings.push(`the narration ends ${overrunMs} ms after the clip, so it is cut (voice.overflow: 'truncate')`);
  const lengthMs = Math.round(clipMs);
  const cut = segments
    .map((segment) => ({ ...segment, durationMs: Math.min(segment.durationMs, lengthMs - segment.delayMs) }))
    .filter((segment) => segment.durationMs > 0);
  return { segments: cut, lengthMs, extendMs: 0, warnings };
}
