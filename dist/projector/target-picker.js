/* Live target preview for ScreenReel Studio: one resolution + outline implementation shared by the
   catalog's selector picker and by the ⌘-hold gesture that adds emphasis without opening a modal.
   No top-level DOM access, so the pure label logic is unit-testable under node --test.

   Everything here draws INSIDE the preview iframe's document, which never loads screenreel.css —
   Studio's copy of that sheet lives in a shadow root in the parent document. Inline styles are the
   only thing that can apply, which is why the boxes below carry no CSS rules at all. */

const SELECTOR_LABEL_LIMIT = 60;      // a selector longer than this tells the author nothing more
const MODE_LABELS = { preview: 'Target preview', highlight: 'Highlight', spotlight: 'Spotlight', target: 'Target', destination: 'Destination', collection: 'Collection' };
const KEY_HINT = '↑ wider · ↓ narrower · click to capture';
/* Literally true: validate() reports "selector matches multiple elements" and Studio.save() aborts
   on the first error, so an ambiguous target is a scene that cannot be saved. */
const MULTI_MARKER = '⚠ more than one element — this will not save';
const NO_SELECTOR_LABEL = 'no stable selector — try its container';
/* A collection picker WANTS many matches (validate() exempts it), so the warning is mode-aware. */
const warnsOnMultiple = (mode, count) => count > 1 && mode !== 'collection';

const OUTLINE_Z = '2147483640';
const BOX_INSET_PX = 4, BOX_GROW_PX = 8;
const LABEL_ABOVE_PX = -24;      // sits above the box, clear of the element it describes
const LABEL_FLIP_TOP_PX = 30;    // above the box would be off-screen: flip it below instead
const LABEL_BELOW_GAP_PX = 10;
const ACCENTS = {
  highlight: { border: '#8b5cf6', shadow: 'rgba(124,58,237,.55)', chip: '#6d28d9' },
  spotlight: { border: '#f59e0b', shadow: 'rgba(180,83,9,.45)', chip: '#b45309' },
};
const MULTI_CHIP = '#b91c1c';

/* Overlay chrome must never resolve as a target. Same predicate text as Recorder.isOverlayTarget,
   which is also why the outline itself keeps an sr- prefixed class. */
const OVERLAY_SELECTOR = '[class^="sr-"],[class*=" sr-"],#__screenreelCursor';
const MODAL_SELECTOR = '.sr-modal-backdrop';

const truncate = (value, limit) => (value.length > limit ? `${value.slice(0, limit - 1)}…` : value);

/* The two lines the author reads off the box: what will be added, to what, and how many elements
   that selector actually hits. Pure — this is what test/target-picker.test.mjs pins. */
export function outlineLabel({ mode, selector, tag, count, depth }) {
  const matches = Number(count) || 0;
  const parts = [
    MODE_LABELS[mode] || MODE_LABELS.target,
    truncate(String(selector || tag || NO_SELECTOR_LABEL), SELECTOR_LABEL_LIMIT),
  ];
  if (matches) parts.push(`${matches} match${matches === 1 ? '' : 'es'}`);
  if (Number(depth) > 0) parts.push(`↑${Number(depth)}`);
  if (warnsOnMultiple(mode, matches)) parts.push(MULTI_MARKER);
  return `${parts.join(' · ')}\n${KEY_HINT}`;
}

/* Everything the outline and the commit both need about one candidate element. `mode`/`depth` are
   the label's own inputs and default to the policy's own reading, so a caller that tracks neither
   (there is none today, but the picker and the gesture disagree about both) still gets a label. */
export function describeTarget(el, policy, core, frameDoc, { mode, depth } = {}) {
  if (!el) return null;
  const selector = policy === 'collection' ? core.selectorForCollection(el) : core.selectorFor(el);
  if (!selector) return null;
  let count = 0;
  // core.queryAll swallows selector throws; mirror that, or one bad hover breaks the whole session.
  try { count = frameDoc.querySelectorAll(selector).length; } catch { count = 0; }
  const tag = String(el.tagName || '').toLowerCase();
  const resolvedMode = mode || (policy === 'collection' ? 'collection' : 'target');
  return { selector, fingerprint: core.fingerprintFor(el), tag, count, warn: warnsOnMultiple(resolvedMode, count), label: outlineLabel({ mode: resolvedMode, selector, tag, count, depth: depth || 0 }) };
}

/* The box that follows the pointer, plus its caption. Created once per session and hidden rather
   than detached between placements, so a fast mousemove never thrashes the iframe's DOM. */
export function createOutline(frameDoc) {
  const box = frameDoc.createElement('div');
  box.className = 'sr-selector-outline';
  Object.assign(box.style, { position: 'fixed', zIndex: OUTLINE_Z, pointerEvents: 'none', border: '3px solid #8b5cf6', borderRadius: '9px', boxShadow: '0 0 0 2px #fff,0 0 22px rgba(124,58,237,.55)', display: 'none' });
  /* The caption is a CHILD of the box, not a sibling: it inherits pointer-events:none, so
     elementFromPoint can never land on the caption and commit the label instead of the target. */
  const label = frameDoc.createElement('div');
  label.className = 'sr-selector-label';
  Object.assign(label.style, { position: 'absolute', left: '-3px', padding: '3px 7px', borderRadius: '6px', color: '#fff', font: '600 11px/1.45 ui-sans-serif,system-ui,sans-serif', whiteSpace: 'pre', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' });
  box.appendChild(label);
  frameDoc.body.appendChild(box);
  return {
    place(el, descriptor, accent = ACCENTS.highlight) {
      const rect = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: `${rect.left - BOX_INSET_PX}px`, top: `${rect.top - BOX_INSET_PX}px`, width: `${rect.width + BOX_GROW_PX}px`, height: `${rect.height + BOX_GROW_PX}px`, borderColor: accent.border, boxShadow: `0 0 0 2px #fff,0 0 22px ${accent.shadow}` });
      label.textContent = descriptor ? descriptor.label : outlineLabel({ mode: 'target', selector: null, count: 0, depth: 0 });
      label.style.background = descriptor?.warn ? MULTI_CHIP : accent.chip;
      label.style.top = rect.top < LABEL_FLIP_TOP_PX ? `${rect.height + LABEL_BELOW_GAP_PX}px` : `${LABEL_ABOVE_PX}px`;
    },
    clear() { box.style.display = 'none'; },
    remove() { box.remove(); },
  };
}

/* Hold ⌘/Ctrl (highlight) or Alt (spotlight) and a box follows the pointer showing exactly what a
   click would capture; the click commits it and never reaches the app. States are
   idle → armed → previewing, and both a commit and any disarm land back on idle.

   Keys are bound to BOTH the frame window and the host document in capture phase, sharing one state
   machine: the keydown arrives on whichever document has focus, and binding only the iframe is why
   ↑/↓/Esc used to be dead until the first click — which was itself the selection. */
export class GestureHighlighter {
  constructor({ frame, core, shell, isPickerActive, onCommit, onReject }) {
    this.frame = frame; this.core = core; this.shell = shell;
    this.isPickerActive = isPickerActive || (() => false);
    this.onCommit = onCommit || (() => {}); this.onReject = onReject || (() => {});
    this.state = 'idle'; this.mode = null; this.target = null; this.descriptor = null;
    this.stack = [];      // elevation history, so ↓ can walk all the way back down
    this.pointer = null;  // last pointer position inside the preview; null means "not in there"
    this.isMac = /Mac|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || '');
    this.outline = null; this.teardown = [];
  }

  attach() {
    const frameDoc = this.frame?.contentDocument; const frameWin = frameDoc?.defaultView;
    const hostDoc = this.frame?.ownerDocument; const hostWin = hostDoc?.defaultView;
    if (!frameDoc || !frameWin || !hostWin) return false;
    this.frameDoc = frameDoc;
    const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); this.teardown.push(() => target.removeEventListener(type, handler, options)); };
    on(frameDoc, 'mousemove', (event) => this.handleMove(event), { capture: true, passive: true });
    on(frameDoc, 'mouseleave', () => { this.pointer = null; this.disarm(); }, true);
    on(frameWin, 'click', (event) => this.handleClick(event), true);
    on(frameWin, 'keydown', (event) => this.handleKeydown(event), true);
    on(frameWin, 'keyup', (event) => this.handleKeyup(event), true);
    /* ⌘-Tab away and the keyup never arrives, so blur is what stops the box sticking on screen. */
    on(frameWin, 'blur', () => this.disarm(), false);
    on(hostDoc, 'keydown', (event) => this.handleKeydown(event), true);
    on(hostDoc, 'keyup', (event) => this.handleKeyup(event), true);
    on(hostWin, 'blur', () => this.disarm(), false);
    on(this.frame, 'mouseleave', () => { this.pointer = null; this.disarm(); }, false);
    this.outline = createOutline(frameDoc);
    return true;
  }

  isArmed() { return this.state !== 'idle'; }

  /* Arming is gated on the pointer being inside the preview, which pays twice: Cmd+S no longer
     flashes a box, and the outline can never appear somewhere a click would not have landed. */
  canArm(event) {
    // this.frameDoc is nulled by destroy(), which is what stops a torn-down instance from arming if
    // it is still mid-dispatch when Studio re-renders (Cmd+S while the modifier is held).
    return !!(event.isTrusted && this.frameDoc && this.frame?.contentDocument && this.pointer && !this.isPickerActive() && !this.shell?.querySelector(MODAL_SELECTOR));
  }

  handleKeydown(event) {
    if (this.state !== 'idle') {
      if (event.key === 'Escape') { event.preventDefault(); this.disarm(); return; }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && this.state === 'previewing') { event.preventDefault(); this.elevate(event.key === 'ArrowUp'); return; }
    }
    // On macOS Ctrl is a non-committing target preview; Cmd commits a highlight. Windows/Linux
    // keep Ctrl+click as the capture gesture because they have no Cmd key.
    const next = event.metaKey ? 'highlight' : (event.ctrlKey ? (this.isMac ? 'preview' : 'highlight') : event.altKey ? 'spotlight' : null);
    // Nothing else is preventDefault-ed on the host side, so the shell's own Cmd+S still saves.
    if (!next || (this.state !== 'idle' && this.mode === next) || !this.canArm(event)) return;
    this.arm(next);
  }

  handleKeyup(event) {
    if (this.state === 'idle') return;
    const held = this.mode === 'highlight' ? (this.isMac ? event.metaKey : event.ctrlKey) : this.mode === 'preview' ? event.ctrlKey : event.altKey;
    if (!held) this.disarm();
  }

  /* Arming previews whatever is already under the pointer: the author holds the modifier without
     moving the mouse, so waiting for a mousemove would show nothing. */
  arm(mode) {
    this.mode = mode; this.state = 'armed'; this.target = null; this.descriptor = null; this.stack.length = 0;
    const resolved = this.resolve(this.frameDoc.elementFromPoint(this.pointer.x, this.pointer.y));
    if (resolved) this.show(resolved); else this.outline.clear();
  }

  handleMove(event) {
    this.pointer = { x: event.clientX, y: event.clientY };
    if (this.state === 'idle') return;
    const resolved = this.resolve(event.target);
    // Same element as last time: its box and label cannot have changed, and describing it again
    // means a selectorFor sweep of the whole document on every pointer tick.
    if (resolved && resolved === this.target) return;
    if (resolved) { this.stack.length = 0; this.show(resolved); return; }
    /* No fallback to the raw element on purpose. resolvePickerTarget already walks up on its own and
       returns null only when the element is itself broad (BODY/HTML/MAIN, a tab panel, >70% of the
       viewport), so null is a verdict — falling back would let a click commit `body`. */
    this.target = null; this.descriptor = null; this.stack.length = 0; this.outline.clear(); this.state = 'armed';
  }

  resolve(el) {
    if (!el || el.closest?.(OVERLAY_SELECTOR)) return null;
    return this.core.resolvePickerTarget(el, 'visual', this.frameDoc) || null;
  }

  elevate(up) {
    if (up) {
      const parent = this.target?.parentElement;
      if (!parent || parent === this.frameDoc.body) return;
      this.stack.push(this.target); this.target = parent;
    } else if (this.stack.length) {
      this.target = this.stack.pop();
    } else return;
    this.show(this.target);
  }

  show(el) {
    this.target = el; this.state = 'previewing';
    this.descriptor = describeTarget(el, 'visual', this.core, this.frameDoc, { mode: this.mode, depth: this.stack.length });
    this.outline.place(el, this.descriptor, ACCENTS[this.mode] || ACCENTS.highlight);
  }

  /* The click is always swallowed, target or not: the author was holding a modifier on purpose, and
     letting that click through to the app is worse than doing nothing. */
  handleClick(event) {
    if (this.state === 'idle' || !event.isTrusted) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const { mode, target, descriptor } = this;
    this.disarm();
    if (mode === 'preview') return;
    if (!target) return this.onReject('Nothing to capture there — try its container');
    if (!descriptor?.selector) return this.onReject('No stable selector for that element — try its container');
    this.onCommit({ annotation: mode, selector: descriptor.selector, fingerprint: descriptor.fingerprint });
  }

  disarm() {
    this.state = 'idle'; this.mode = null; this.target = null; this.descriptor = null; this.stack.length = 0;
    this.outline?.clear();
  }

  destroy() {
    this.disarm();
    for (const off of this.teardown.splice(0)) off();
    this.outline?.remove(); this.outline = null; this.frameDoc = null;
  }
}
