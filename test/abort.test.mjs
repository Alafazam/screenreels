import test from 'node:test';
import assert from 'node:assert/strict';
import '../packages/core/action-runtime.js';

/* An exit (Esc, ✕, Skip) aborts the run's signal while an action is part way. The action must stop
   before its next change to the page: no click, no keystroke, no press after the exit. */
const { runAction, sleep } = globalThis.ScreenReelCore;

/** A text field or button in view, recording what is done to it. */
function fakeField() {
  const log = [];
  class FakeEvent { constructor(type) { this.type = type; } }
  const win = { innerWidth: 1000, innerHeight: 800, Event: FakeEvent, MouseEvent: FakeEvent };
  const el = {
    value: '', isConnected: true, ownerDocument: { defaultView: win },
    getBoundingClientRect: () => ({ left: 100, top: 300, right: 200, bottom: 330, width: 100, height: 30 }),
    focus: () => log.push('focus'), click: () => log.push('click'),
    dispatchEvent: (event) => log.push(`${event.type}:${el.value}`),
  };
  const doc = { querySelectorAll: () => [el], defaultView: win };
  return { el, doc, win, log };
}

test('sleep() with a signal that is already aborted returns at once', async () => {
  const controller = new AbortController(); controller.abort();
  const started = Date.now();
  await sleep(2000, controller.signal);
  assert(Date.now() - started < 100, `waited ${Date.now() - started} ms`);
});

test('an exit during the cursor move stops a type action before it touches the field', async () => {
  const { doc, win, log, el } = fakeField(); const controller = new AbortController();
  const result = await runAction({ type: 'type', selector: '#name', text: 'Hello' }, { document: doc, window: win, signal: controller.signal, moveCursor: async () => controller.abort() });
  assert.deepEqual(result, { ok: false, error: 'aborted' });
  assert.deepEqual(log, []); assert.equal(el.value, '');
});

test('an exit part way through typing stops the typing', async () => {
  const { doc, win, log, el } = fakeField(); const controller = new AbortController();
  const typing = runAction({ type: 'type', selector: '#name', text: 'Hello world', charMs: 30 }, { document: doc, window: win, signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 75)); // two or three characters in
  controller.abort();
  const result = await typing;
  const typed = el.value;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(result, { ok: false, error: 'aborted' });
  assert(typed.length > 0 && typed.length < 'Hello world'.length, `typed "${typed}"`);
  assert.equal(el.value, typed, 'typing went on after the exit');
  // The only change event is the clear before typing (clearFirst), never one for the typed text.
  assert.deepEqual(log.filter((entry) => entry.startsWith('change')), ['change:'], 'a stopped type action does not commit with change');
});

test('an exit during the cursor move stops a click: no press, no click', async () => {
  const { doc, win, log } = fakeField(); const controller = new AbortController(); let pressed = false;
  const result = await runAction({ type: 'click', selector: '#send' }, { document: doc, window: win, signal: controller.signal, moveCursor: async () => controller.abort(), pressCursor: async () => { pressed = true; } });
  assert.deepEqual(result, { ok: false, error: 'aborted' });
  assert.equal(pressed, false, 'the press would draw the cursor again after the exit');
  assert(!log.includes('click'));
});

test('an action that starts after the exit does nothing', async () => {
  const { doc, win, log } = fakeField(); const controller = new AbortController(); controller.abort();
  let moved = false;
  const result = await runAction({ type: 'click', selector: '#send' }, { document: doc, window: win, signal: controller.signal, moveCursor: async () => { moved = true; } });
  assert.deepEqual(result, { ok: false, error: 'aborted' });
  assert.equal(moved, false); assert.deepEqual(log, []);
});
