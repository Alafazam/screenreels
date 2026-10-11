import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/playback.js';

const P = globalThis.ScreenReelPlayback;
const flow = (defaults = {}, scenes = [{ id: 's1', route: '/', actions: [{ type: 'callout', selector: '#a', text: 'Hi' }] }]) => ({ id: 'f', name: 'F', defaults, scenes });
const resolve = ({ defaults, options, requested, canAsk, remembered } = {}) => P.resolveMode({ flow: P.flowConfig(flow(defaults)), mount: P.mountConfig(options), requested, canAsk, remembered });
const settings = (mode, defaults, options) => P.resolveSettings(mode, P.flowConfig(flow(defaults)), P.mountConfig(options));

test('each mode is a preset of the same settings', () => {
  assert.deepEqual(P.MODES, ['video', 'autoplay', 'guided']);
  for (const mode of P.MODES) assert.deepEqual(Object.keys(P.PRESETS[mode]).sort(), Object.keys(P.FIELDS).sort(), mode);
  assert.equal(P.PRESETS.video.callouts, 'off');
  assert.equal(P.PRESETS.autoplay.callouts, 'timed');
  assert.equal(P.PRESETS.guided.callouts, 'step');
  assert.deepEqual(P.PRESETS.guided.controls, []);
  assert.equal(P.PRESETS.guided.keys, true);
  assert.equal(P.PRESETS.video.startCard && P.PRESETS.video.endCard && P.PRESETS.autoplay.startCard, true);
});

test('mode precedence: start() > host force > flow default > host default > autoplay', () => {
  const playback = { default: 'video', modes: ['video', 'guided'] };
  assert.equal(resolve().mode, 'autoplay');
  assert.equal(resolve({ options: { playback: { default: 'guided' } } }).mode, 'guided');
  assert.equal(resolve({ defaults: { playback }, options: { playback: { default: 'guided' } } }).mode, 'video');
  assert.equal(resolve({ defaults: { playback }, options: { playback: { force: 'guided' } } }).mode, 'guided');
  assert.equal(resolve({ defaults: { playback }, options: { playback: { force: 'guided' } }, requested: 'autoplay' }).mode, 'autoplay');
  assert.equal(resolve({ requested: 'auto' }).mode, 'autoplay', "start({ mode: 'auto' }) still works");
});

test('ask shows a chooser of the offered modes, in the flow\'s order', () => {
  const result = resolve({ defaults: { playback: { default: 'ask', modes: ['video', 'guided', 'autoplay'] } } });
  assert.deepEqual(result, { mode: null, ask: true, offered: ['video', 'guided', 'autoplay'], preselect: null, source: 'flow' });
  assert.deepEqual(resolve({ defaults: { playback: { default: 'ask' } } }).offered, ['guided', 'autoplay'], 'guided + autoplay when the flow lists none');
});

test('ask without a chooser: one offered mode plays, a run that cannot ask falls back', () => {
  assert.deepEqual(resolve({ defaults: { playback: { default: 'ask', modes: ['video'] } } }).mode, 'video');
  assert.equal(resolve({ defaults: { playback: { default: 'ask', modes: ['guided', 'video'] } }, canAsk: false }).mode, 'guided', 'first offered when autoplay is not');
  assert.equal(resolve({ defaults: { advance: 'ask' }, canAsk: false }).mode, 'autoplay', 'share links play an ask flow as autoplay, as before');
  assert.equal(resolve({ defaults: { advance: 'ask' }, options: { chooser: false } }).mode, 'autoplay');
});

test('host modes narrow what a flow offers and what it can play', () => {
  const defaults = { playback: { default: 'ask', modes: ['video', 'guided', 'autoplay'] } };
  assert.deepEqual(resolve({ defaults, options: { playback: { modes: ['guided', 'autoplay'] } } }).offered, ['guided', 'autoplay']);
  assert.equal(resolve({ defaults: { playback: { default: 'video' } }, options: { playback: { modes: ['guided'] } } }).mode, 'guided');
  assert.deepEqual(resolve({ defaults: { playback: { default: 'ask', modes: ['video'] } }, options: { playback: { modes: ['guided'] } } }).offered, ['guided'], 'no overlap: the host wins');
});

test('remembered picks preselect, or skip the chooser when asked to', () => {
  const defaults = { playback: { default: 'ask' } };
  assert.equal(resolve({ defaults, options: { playback: { remember: true } }, remembered: 'guided' }).preselect, 'guided');
  assert.equal(resolve({ defaults, options: { playback: { remember: 'skip' } }, remembered: 'guided' }).mode, 'guided');
  assert.equal(resolve({ defaults, options: { playback: { remember: 'skip' } }, remembered: 'guided', requested: 'ask' }).ask, true, "start({ mode: 'ask' }) always asks");
  assert.equal(resolve({ defaults, options: { playback: { remember: 'skip' } }, remembered: 'video' }).ask, true, 'a pick the flow no longer offers is ignored');
});

test('back-compat: older options map onto the model', () => {
  assert.equal(P.flowConfig(flow({ advance: 'auto' })).default, 'autoplay');
  assert.equal(P.flowConfig(flow({ advance: 'guided' })).default, 'guided');
  assert.equal(P.flowConfig(flow({ advance: 'ask' })).default, 'ask');
  const msui = P.mountConfig({ chooser: true, controls: { guided: [], auto: ['prev', 'play', 'next', 'exit'] }, shield: false, narration: false, cursor: 'dot' });
  assert.equal(msui.force, 'ask');
  assert.deepEqual(msui.overrides.guided.controls, []);
  assert.deepEqual(msui.overrides.autoplay.controls, ['prev', 'play', 'next', 'exit']);
  assert.deepEqual(msui.limits, { narration: false, shield: false });
  assert.deepEqual(msui.deprecated.sort(), ['chooser', 'controls']);
  assert.equal(P.mountConfig({ advance: 'auto' }).force, 'autoplay');
  assert.equal(P.mountConfig({ advance: 'guided', chooser: true }).force, 'ask', 'chooser: true wins over advance, as before');
  assert.equal(P.mountConfig({ chooser: true, playback: { force: 'video' } }).force, 'video', 'playback.force wins over chooser');
  assert.deepEqual(P.mountConfig({ controls: ['play'] }).overrides.video.controls, ['play']);
  // An older host (ms-ui's guide player) resolves exactly as it did.
  assert.deepEqual(resolve({ defaults: { advance: 'guided' }, options: { chooser: true } }).ask, true);
});

test('a run with no playback config keeps the pre-model look', () => {
  const legacy = settings('autoplay', { advance: 'auto' }, { controls: { auto: ['prev', 'next'] } });
  assert.deepEqual([legacy.startCard, legacy.endCard, legacy.progress, legacy.controlLabels], [false, false, false, false]);
  assert.deepEqual(legacy.controls, ['prev', 'next'], 'host controls still apply');
  assert.equal(settings('autoplay').controls, null, 'null: the presenter/share default pill');
  assert.equal(settings('guided').callouts, 'step');
  const modeled = settings('autoplay', { playback: { default: 'autoplay' } });
  assert.equal(modeled.startCard, true);
});

test('settings precedence: preset < host per-mode < flow per-mode < host limits', () => {
  const options = { playback: { video: { callouts: 'caption', progress: false } }, narration: false };
  const defaults = { playback: { default: 'video', video: { progress: true } } };
  const resolved = settings('video', defaults, options);
  assert.equal(resolved.callouts, 'caption', 'host per-mode');
  assert.equal(resolved.progress, true, 'flow beats host per-mode');
  assert.equal(resolved.narration, false, 'host limit beats everything');
  assert.equal(settings('video', { playback: { video: { narration: true } } }, { narration: false }).narration, false);
  assert.equal(settings('guided', { playback: { guided: { bogus: 1 } } }).bogus, undefined, 'unknown keys do not leak');
});

test('validation catches bad playback config', () => {
  const errors = (defaults) => P.validateFlowPlayback(flow(defaults)).errors;
  assert.deepEqual(errors({ playback: { default: 'ask', modes: ['guided', 'autoplay'] } }), []);
  assert.match(errors({ playback: { modes: ['ask'] } })[0], /unknown modes: ask .*"ask" goes in default/);
  assert.match(errors({ playback: { modes: [] } })[0], /non-empty/);
  assert.match(errors({ playback: { default: 'video', modes: ['guided'] } })[0], /"video" is not in defaults.playback.modes/);
  assert.match(errors({ playback: { default: 'slideshow' } })[0], /must be video, autoplay, guided, ask/);
  assert.match(errors({ playback: { force: 'video' } })[0], /mount option/);
  assert.match(errors({ playback: { video: { callouts: 'popup' } } })[0], /callouts must be step, timed, caption, off/);
  assert.match(errors({ playback: { autoplay: { controls: ['rewind'] } } })[0], /unknown controls: rewind/);
  assert.match(errors({ playback: { guided: { pace: 0 } } })[0], /pace/);
  assert.match(errors({ advance: 'sometimes' })[0], /defaults.advance/);
  assert.deepEqual(P.validateMountPlayback({ remember: 'always' }).length, 1);
  assert.deepEqual(P.validateMountPlayback({ force: 'ask', remember: 'skip', modes: ['guided'] }), []);
});

test('validation warns when guided would play a scene with no info cards', () => {
  const scenes = [{ id: 'intro', route: '/', actions: [{ type: 'countdown' }] }, { id: 'tour', route: '/', actions: [{ type: 'callout', selector: '#a', text: 'Hi' }] }];
  const warn = (defaults) => P.validateFlowPlayback(flow(defaults, scenes)).warnings;
  assert.match(warn({ playback: { default: 'guided' } })[0], /scene intro: no info cards/);
  assert.equal(warn({ advance: 'ask' }).length, 1, 'ask offers guided');
  assert.deepEqual(warn({ playback: { default: 'video' } }), [], 'video only: no warning');
  assert.deepEqual(warn({}), [], 'a flow that says nothing plays autoplay');
  assert.deepEqual(warn({ playback: { default: 'guided', guided: { callouts: 'timed' } } }), [], 'guided without steps does not wait');
  assert.match(warn({ advance: 'guided', playback: { default: 'video' } }).find((line) => line.includes('disagrees')), /playback wins/);
  assert.deepEqual(warn({ advance: 'auto', playback: { default: 'video' } }), [], 'Studio writes autoplay as the older name for video');
});
