import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineLabel } from '../packages/studio/target-picker.js';

test('an unambiguous target reads as one match with no warning', () => {
  const label = outlineLabel({ mode: 'highlight', selector: 'button#submit-control', tag: 'button', count: 1, depth: 0 });
  const [headline, hint] = label.split('\n');
  assert.equal(headline, 'Highlight · button#submit-control · 1 match');
  assert.match(hint, /click to capture/);
  assert.doesNotMatch(label, /⚠/);
});

test('an ambiguous target says so, and says it will not save', () => {
  const label = outlineLabel({ mode: 'highlight', selector: '.kpi-value', tag: 'span', count: 3, depth: 0 });
  assert.match(label, /3 matches/);
  assert.match(label, /⚠/);
  assert.match(label, /will not save/);
});

test('walking up to a container shows how far up it went', () => {
  const label = outlineLabel({ mode: 'spotlight', selector: '.card', tag: 'div', count: 1, depth: 2 });
  const headline = (value) => value.split('\n')[0];
  assert.equal(headline(label), 'Spotlight · .card · 1 match · ↑2');
  assert.doesNotMatch(headline(outlineLabel({ mode: 'spotlight', selector: '.card', tag: 'div', count: 1, depth: 0 })), /↑/);
});
