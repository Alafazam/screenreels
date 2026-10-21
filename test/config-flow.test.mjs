import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadScenes } from '../lib/config.mjs';

function scenesFile(doc) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'screenreel-config-')), 'flows.json');
  fs.writeFileSync(file, JSON.stringify(doc));
  return file;
}
const twoFlows = { flows: [
  { id: 'tour', defaults: { dwellMs: 650 }, scenes: [{ id: 'a', route: './' }, { id: 'b', route: './b' }] },
  { id: 'other', scenes: [{ id: 'c', route: './' }] },
] };

test('config.flow records only that flow, with its defaults', () => {
  const scenes = loadScenes({ scenes: scenesFile(twoFlows), flow: 'tour' });
  assert.deepEqual(scenes.map((scene) => scene.id), ['a', 'b']);
  assert.equal(scenes[0].dwellMs, 650);
});

test('without config.flow every flow is recorded, as before', () => {
  assert.deepEqual(loadScenes({ scenes: scenesFile(twoFlows) }).map((scene) => scene.id), ['a', 'b', 'c']);
});

test('an unknown flow, or a flow on a file without flows, fails loudly', () => {
  assert.throws(() => loadScenes({ scenes: scenesFile(twoFlows), flow: 'nope' }), /"nope" is not a flow .* \(flows: tour, other\)/);
  assert.throws(() => loadScenes({ scenes: scenesFile({ scenes: [{ id: 'a', route: './' }] }), flow: 'tour' }), /has no "flows"/);
});
