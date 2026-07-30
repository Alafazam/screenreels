import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRepairs,
  classifyError,
  isLikelyDynamicTarget,
  proposeRepair,
  rawScenesOf,
  scoreCandidate,
  REPAIR_CONFIDENCE_THRESHOLD,
  SCORE_TEXT_EXACT,
  SCORE_TAG_MATCH,
  SCORE_ROLE_MATCH,
} from '../lib/doctor-heuristics.mjs';

test('validate error strings classify into repair categories', () => {
  assert.deepEqual(classifyError('selector matches multiple elements'), { kind: 'multiple', key: 'selector' });
  assert.deepEqual(classifyError('toSelector has no matches'), { kind: 'missing', key: 'toSelector' });
  assert.deepEqual(classifyError('cursorTo has no matches'), { kind: 'missing', key: 'cursorTo' });
  assert.equal(classifyError('Unsupported action type').kind, 'report-only');
  assert.equal(classifyError('Use a valid local route').kind, 'report-only');
  assert.equal(classifyError('Highlight time (ms) is outside the allowed range').kind, 'report-only');
});

test('dynamic-target downgrade: state-mutating earlier action or matching waitFor', () => {
  const actions = [
    { type: 'highlight', selector: '#a' },
    { type: 'click', selector: '#open' },
    { type: 'highlight', selector: '#modal-title' },
  ];
  assert.equal(isLikelyDynamicTarget(actions, 2), true);   // click precedes
  assert.equal(isLikelyDynamicTarget(actions, 1), false);  // only a highlight precedes
  assert.equal(isLikelyDynamicTarget(actions, 0), false);  // nothing precedes
  const waited = [
    { type: 'waitFor', selector: '#late' },
    { type: 'highlight', selector: '#late' },
  ];
  assert.equal(isLikelyDynamicTarget(waited, 1), true);    // author declared it appears later
});

test('fingerprint scoring ranks exact text above tag/role above token overlap', () => {
  const fingerprint = { text: 'Rock the demo', tag: 'button', role: '' };
  const exact = scoreCandidate(fingerprint, { text: 'Rock the demo', tag: 'button', role: '' });
  const renamed = scoreCandidate(fingerprint, { text: 'Rock the new demo', tag: 'button', role: '' });
  const unrelated = scoreCandidate(fingerprint, { text: 'Sign out', tag: 'a', role: '' });
  assert.equal(exact, SCORE_TEXT_EXACT + SCORE_TAG_MATCH);
  assert(renamed > unrelated && renamed < exact);
  assert.equal(scoreCandidate({ text: '', tag: 'button', role: 'switch' }, { text: '', tag: 'button', role: 'switch' }), SCORE_TAG_MATCH + SCORE_ROLE_MATCH);
});

test('proposeRepair auto-fixes only above the confidence threshold', () => {
  const targets = [
    { selector: '#submit-2', text: 'Rock the demo', tag: 'button', role: '' },
    { selector: '#other', text: 'Cancel', tag: 'button', role: '' },
  ];
  const confident = proposeRepair({ fingerprint: { text: 'Rock the demo', tag: 'button', role: '' }, deadSelector: '#submit', targets });
  assert.equal(confident.kind, 'selector');
  assert.equal(confident.to, '#submit-2');
  assert(confident.confidence >= REPAIR_CONFIDENCE_THRESHOLD);
  const weak = proposeRepair({ fingerprint: { text: 'Something else entirely', tag: 'div', role: '' }, deadSelector: '#submit', targets });
  assert.equal(weak.kind, 'none');
});

test('without a fingerprint the doctor only reports candidates, never fixes', () => {
  const targets = [
    { selector: '#customer-name', text: 'Customer name', tag: 'input', role: '' },
    { selector: '#region', text: 'Region', tag: 'select', role: '' },
  ];
  const proposal = proposeRepair({ fingerprint: null, deadSelector: '#customer-title', targets });
  assert.equal(proposal.kind, 'none');
  assert.equal(proposal.confidence, 0);
  assert.equal(proposal.candidates[0].selector, '#customer-name'); // token overlap on "customer"
});

test('rawScenesOf locates scenes across all three manifest shapes', () => {
  const flows = { flows: [{ scenes: [{ id: 'a' }] }, { scenes: [{ id: 'b' }] }] };
  assert.equal(rawScenesOf(flows, 1)[0].id, 'b');
  assert.equal(rawScenesOf({ scenes: [{ id: 'c' }] }, 0)[0].id, 'c');
  assert.equal(rawScenesOf({ steps: [{ id: 'd' }] }, 0)[0].id, 'd');
  assert.equal(rawScenesOf({ scenes: [] }, 1), null); // steps/scenes shapes wrap exactly one flow
});

test('applyRepairs mutates only the targeted keys and preserves the rest of the file', () => {
  const raw = {
    schemaVersion: 1,
    customTopLevel: 'kept',
    flows: [{ id: 'f', name: 'Flow', scenes: [{ id: 's', route: '/', customSceneKey: true, actions: [
      { type: 'click', selector: '#old', note: 'kept too' },
      { type: 'highlight', selector: '#fine' },
    ] }] }],
  };
  const applied = applyRepairs(raw, [
    { flowIndex: 0, sceneIndex: 0, actionIndex: 0, set: { selector: '#new', fingerprint: { text: 'Go', tag: 'button', role: '' } } },
    { flowIndex: 0, sceneIndex: 0, actionIndex: 9, set: { selector: '#nope' } }, // out of range: skipped
  ]);
  assert.equal(applied, 1);
  assert.equal(raw.flows[0].scenes[0].actions[0].selector, '#new');
  assert.equal(raw.flows[0].scenes[0].actions[0].note, 'kept too');
  assert.deepEqual(Object.keys(raw.flows[0].scenes[0].actions[0]), ['type', 'selector', 'note', 'fingerprint']); // key order preserved, new keys append
  assert.equal(raw.customTopLevel, 'kept');
  assert.equal(raw.flows[0].scenes[0].customSceneKey, true);
});
