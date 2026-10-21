import test from 'node:test';
import assert from 'node:assert/strict';
import { planNarrationTrack } from '../lib/narration-track.mjs';

test('each file starts at its card and the track is as long as the clip', () => {
  const plan = planNarrationTrack({ clipMs: 10000, steps: [
    { file: 'b.mp3', offsetMs: 5200.4, durationMs: 2000, card: 1 },
    { file: 'a.mp3', offsetMs: 300, durationMs: 4000, card: 0 },
  ] });
  assert.deepEqual(plan.segments, [
    { file: 'a.mp3', delayMs: 300, durationMs: 4000 },
    { file: 'b.mp3', delayMs: 5200, durationMs: 2000 },
  ]);
  assert.equal(plan.lengthMs, 10000);
  assert.equal(plan.extendMs, 0);
  assert.deepEqual(plan.warnings, []);
});

test('a file that runs into the next card is cut where the next card starts, with a warning', () => {
  const plan = planNarrationTrack({ clipMs: 9000, steps: [
    { file: 'a.mp3', offsetMs: 0, durationMs: 5000, card: 0 },
    { file: 'b.mp3', offsetMs: 4000, durationMs: 3000, card: 3 },
  ] });
  assert.deepEqual(plan.segments.map((segment) => segment.durationMs), [4000, 3000]);
  assert.match(plan.warnings[0], /card 0: its narration runs 1000 ms into the next card's/);
});

test("overflow 'extend' holds the last frame until the voice ends", () => {
  const plan = planNarrationTrack({ clipMs: 3000, overflow: 'extend', steps: [{ file: 'a.mp3', offsetMs: 1000, durationMs: 2600 }] });
  assert.equal(plan.extendMs, 600);
  assert.equal(plan.lengthMs, 3600);
  assert.equal(plan.segments[0].durationMs, 2600);
  assert.match(plan.warnings[0], /600 ms after the clip, so the last frame is held/);
});

test("overflow 'truncate' keeps the clip length and cuts the voice", () => {
  const plan = planNarrationTrack({ clipMs: 3000, overflow: 'truncate', steps: [{ file: 'a.mp3', offsetMs: 1000, durationMs: 2600 }] });
  assert.equal(plan.extendMs, 0);
  assert.equal(plan.lengthMs, 3000);
  assert.equal(plan.segments[0].durationMs, 2000);
  assert.match(plan.warnings[0], /so it is cut/);
});

test('no files gives a silent track of the clip length', () => {
  assert.deepEqual(planNarrationTrack({ clipMs: 1500 }), { segments: [], lengthMs: 1500, extendMs: 0, warnings: [] });
});

test('bad input fails loudly', () => {
  assert.throws(() => planNarrationTrack({ clipMs: 0 }), /clipMs must be a positive number/);
  assert.throws(() => planNarrationTrack({ clipMs: 10, overflow: 'loop' }), /overflow must be/);
  assert.throws(() => planNarrationTrack({ clipMs: 10, steps: [{ file: 'a.mp3', offsetMs: 0, durationMs: 0, card: 2 }] }), /a\.mp3 has no length/);
  assert.throws(() => planNarrationTrack({ clipMs: 10, steps: [{ offsetMs: 0, durationMs: 5, card: 2 }] }), /card 2 has no file/);
});
