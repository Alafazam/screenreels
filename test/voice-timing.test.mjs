import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findWord, formatFlowFile, normalizeWord, planStep, shiftWords, wordsFromAlignment } from '../scripts/voice-timing.mjs';

const TIMING = { leadMs: 300, tailMs: 700, actionLeadMs: 450 };

function alignmentOf(text, secondsPerChar = 0.1, startS = 0) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => startS + index * secondsPerChar),
    character_end_times_seconds: characters.map((_, index) => startS + (index + 1) * secondsPerChar),
  };
}

test('wordsFromAlignment groups characters into words with their start and end', () => {
  const rounded = wordsFromAlignment(alignmentOf('Let\'s build one.')).map((word) => ({ w: word.w, s: Number(word.s.toFixed(3)), e: Number(word.e.toFixed(3)) }));
  assert.deepEqual(rounded, [
    { w: 'Let\'s', s: 0, e: 0.5 },
    { w: 'build', s: 0.6, e: 1.1 },
    { w: 'one.', s: 1.2, e: 1.6 },
  ]);
});

test('wordsFromAlignment drops punctuation-only tokens and rejects a malformed alignment', () => {
  assert.deepEqual(wordsFromAlignment(alignmentOf('Yes — go')).map((word) => word.w), ['Yes', 'go']);
  assert.throws(() => wordsFromAlignment({ characters: ['a'], character_start_times_seconds: [], character_end_times_seconds: [] }), /same length/);
});

test('normalizeWord ignores case and punctuation', () => {
  assert.equal(normalizeWord('GitHub,'), 'github');
  assert.equal(normalizeWord('Let\'s'), 'let\'s');
});

test('shiftWords moves every word by the trimmed silence and never below zero', () => {
  assert.deepEqual(shiftWords([{ w: 'a', s: 0.5, e: 0.9 }, { w: 'b', s: 0.02, e: 0.1 }], 0.3).map((word) => [word.s, word.e].map((value) => Number(value.toFixed(3)))), [[0.2, 0.6], [0, 0]]);
});

test('findWord reads bare anchors in order and nth from the start', () => {
  const words = [{ w: 'one' }, { w: 'two' }, { w: 'one' }];
  assert.equal(findWord(words, { word: 'one' }), 0);
  assert.equal(findWord(words, { word: 'one' }, 1), 2);
  assert.equal(findWord(words, { word: 'one', nth: 2 }), 2);
  assert.equal(findWord(words, { word: 'three' }), -1);
});

test('planStep: stepMs is lead + take + tail, and an anchored action fires before its word', () => {
  const words = [{ w: 'Drag', s: 0, e: 0.4 }, { w: 'then', s: 0.5, e: 0.8 }, { w: 'point', s: 2, e: 2.4 }];
  const result = planStep({ words, durationMs: 3000, anchors: [{ action: 'drag', word: 'drag' }, { action: 'point', word: 'point', offset: 0.1 }], timing: TIMING });
  assert.equal(result.stepMs, 4000);
  // 300 + 0 - 450 is clamped to 0; 300 + 2000 - 450 + 100.
  assert.deepEqual(result.atMs, [{ action: 'drag', atMs: 0 }, { action: 'point', atMs: 1950 }]);
});

test('planStep keeps times in order, accepts a fixed atMs, and warns on a busy action', () => {
  const words = [{ w: 'a', s: 1, e: 1.1 }, { w: 'b', s: 1.1, e: 1.2 }];
  const result = planStep({
    words, durationMs: 2000, timing: TIMING,
    anchors: [{ action: 'scroll', atMs: 900 }, { action: 'type', word: 'a' }, { action: 'click', word: 'b' }],
    actions: { type: { type: 'type', text: 'abcdef', charMs: 50 } },
  });
  assert.deepEqual(result.atMs.map((item) => item.atMs), [900, 900, 950]);
  assert.match(result.warnings[0], /"type" runs 300 ms but "click" is due 50 ms later/);
});

test('planStep fails loudly on a missing word or a time past the step', () => {
  assert.throws(() => planStep({ words: [{ w: 'a', s: 0, e: 1 }], durationMs: 1000, anchors: [{ action: 'x', word: 'zebra' }], timing: TIMING }), /"zebra" .* is not in the line/);
  assert.throws(() => planStep({ words: [], durationMs: 1000, anchors: [{ action: 'x', atMs: 5000 }], timing: TIMING }), /past the step's 2000 ms/);
});

test('formatFlowFile reproduces the committed flow file byte for byte', () => {
  for (const file of ['examples/action-showcase/screenreel.demo.json']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(formatFlowFile(JSON.parse(text)), text);
  }
});

test('every voiced landing card has a committed audio file and an in-order timeline', () => {
  const flow = JSON.parse(fs.readFileSync('examples/action-showcase/screenreel.demo.json', 'utf8')).flows.find((item) => item.id === 'guided-tour');
  const cards = flow.scenes.flatMap((scene) => scene.actions).filter((action) => action.narrationAudio);
  for (const card of cards) {
    assert.ok(fs.existsSync(`examples/action-showcase/${card.narrationAudio}`), `${card.narrationAudio} is committed`);
    assert.ok(card.stepMs > 0 && card.narration, `${card.id} has stepMs and narration`);
  }
});
