/* Record-by-doing for ScreenReel Studio: the user interacts with the preview iframe and the
   interactions become flow actions. Two layers, one file:
   - Coalescer: pure event-record → action logic (no DOM), unit-testable under node --test.
   - Recorder: DOM edge — normalizes trusted iframe events into plain records, survives
     in-frame navigations, and applies the coalescer's ops through Studio callbacks. */

/* Timing and thresholds. Canonical per-action defaults (charMs 45, lever durMs 1200, …) are NOT
   re-declared here — the Coalescer reads them through the injected definitionDefaults lookup so
   the action registry stays the single source of truth. */
/* A read-and-scroll rhythm pauses 0.5-1.5s between flicks, so the merge window has to outlast
   that without swallowing genuinely separate beats. It must also stay BELOW IDLE_GAP_MAX_MS so
   any pause long enough to split a scroll burst is still fully replayable as afterMs. */
/* An info card captured on an element starts titled with that element's own text, so the author
   edits words rather than starting from a blank card. Empty text means an untitled card. */
export const CARD_TITLE_PREFILL_CHARS = 60;
const RECORDING_KEYS = '⌘/Ctrl+click highlights · ⇧⌘/⇧Ctrl+click adds an info card · Alt+click spotlights · Esc stops';
export function cardFieldsFor(annotation, fingerprint) {
  if (annotation !== 'callout') return {};
  const text = String(fingerprint?.text || '').replace(/\s+/g, ' ').trim();
  return text ? { title: text.length > CARD_TITLE_PREFILL_CHARS ? `${text.slice(0, CARD_TITLE_PREFILL_CHARS - 1)}…` : text } : {};
}
export const SCROLL_BURST_GAP_MS = 2500;
/* The debounce that ends a burst and calls flush() must outlast the merge window above it, or
   flush() ends the burst before a same-window scroll ever arrives, making the window dead code. */
export const SCROLL_FLUSH_MS = SCROLL_BURST_GAP_MS + 100;
/* durMs is written onto a scroll-by action whose field spec is min:100,max:10000 (see
   packages/core/action-runtime.js), enforced by validate() — a measured value must never be one
   save() would reject. */
export const SCROLL_DUR_MIN_MS = 200;
export const SCROLL_DUR_MAX_MS = 4000;
export const IDLE_GAP_MIN_MS = 300;           // pauses shorter than this are not worth replaying
export const IDLE_GAP_MAX_MS = 5000;          // cap replayed pauses; nobody wants a 30s afterMs
export const IDLE_GAP_ROUND_MS = 100;         // round pauses so manifests stay tidy
export const CHAR_MS_MIN = 20;                // clamp measured typing speed to a watchable range
export const CHAR_MS_MAX = 200;
export const NAV_ATTRIBUTION_MS = 1500;       // a navigation this soon after a click IS that click
export const CHANGE_CLICK_MERGE_MS = 120;     // change this soon after a same-target click replaces it
export const DRAG_MIN_DISTANCE_PX = 12;        // pointer jitter and ordinary clicks stay clicks
export const DRAG_DUR_MIN_MS = 100;
export const DRAG_DUR_MAX_MS = 10000;
// The smallest scroll worth its OWN action; smaller remainders merge into the scroll they continue.
export const SCROLL_MIN_VIEWPORT_PERCENT = 2;
export const SENSITIVE_INPUT_TYPES = ['password'];
const TEXT_INPUT_TYPES = ['text', 'email', 'search', 'tel', 'url', 'number'];
const CLICK_KEEP_INPUT_TYPES = ['button', 'submit', 'reset', 'image'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

/* Turns a stream of normalized event records into flow actions. Records carry selectors as
   plain strings (computed at event time — elements die on navigation) and wall-clock `at`
   timestamps. Ops: append a new action, patch the last one (idle-gap afterMs), or replace the
   last one (a click that turned out to be a navigation becomes goto). */
export class Coalescer {
  constructor({ definitionDefaults, route = null }) {
    this.defaults = definitionDefaults || (() => ({}));
    this.route = route;
    this.pendingType = null;    // { selector, value, lastAt, firstAt, gaps: [] }
    this.pendingScroll = null;  // { selector, deltaX, deltaY, firstAt, lastAt, viewportW, viewportH }
    this.scrollCarry = null;    // sub-threshold remainder with nowhere to go yet: { selector, deltaX, deltaY, viewportW, viewportH }
    this.lastScroll = null;     // mirror of the last APPENDED scroll: { selector, direction, amount, durMs }
    this.lastEmitted = null;    // { type, selector, at } of the last appended action
    this.emittedCount = 0;
  }

  push(record) {
    const ops = [];
    if (record.kind === 'scroll') {
      this.finalizeType(ops);
      const sameBurst = this.pendingScroll && this.pendingScroll.selector === record.selector && record.at - this.pendingScroll.lastAt <= SCROLL_BURST_GAP_MS && !this.reverses(record);
      if (sameBurst) {
        this.pendingScroll.deltaX += record.deltaX; this.pendingScroll.deltaY += record.deltaY; this.pendingScroll.lastAt = record.at;
      } else {
        this.finalizeScroll(ops);
        this.pendingScroll = { selector: record.selector, deltaX: record.deltaX, deltaY: record.deltaY, firstAt: record.at, lastAt: record.at, viewportW: record.viewportW, viewportH: record.viewportH };
        this.absorbCarry();
      }
      return ops;
    }
    this.finalizeScroll(ops);
    // Nothing outside a scroll burst can ever claim a sub-threshold carry, so any non-scroll
    // record (click, type, annotate, ...) ends its life here rather than let it leak into a
    // later, unrelated scroll.
    this.scrollCarry = null;
    if (record.kind === 'input') {
      if (this.pendingType && this.pendingType.selector === record.selector) {
        this.pendingType.gaps.push(record.at - this.pendingType.lastAt);
        this.pendingType.value = record.value; this.pendingType.lastAt = record.at;
      } else {
        this.finalizeType(ops);
        this.pendingType = { selector: record.selector, fingerprint: record.fingerprint, value: record.value, firstAt: record.at, lastAt: record.at, gaps: [] };
      }
    } else if (record.kind === 'click') {
      this.finalizeType(ops);
      this.emit(ops, { type: 'click', definitionId: 'click', selector: record.selector }, record.at, record.at, record.fingerprint);
    } else if (record.kind === 'annotate') {
      this.finalizeType(ops);
      /* highlight/spotlight/callout definitionIds share their type string in the registry (see
         packages/core/action-runtime.js definitions), so record.annotation doubles as both. */
      this.emit(ops, { type: record.annotation, definitionId: record.annotation, selector: record.selector, ...this.defaults(record.annotation), ...cardFieldsFor(record.annotation, record.fingerprint) }, record.at, record.at, record.fingerprint);
    } else if (record.kind === 'drag') {
      this.finalizeType(ops);
      const action = { type: 'drag', definitionId: 'drag', selector: record.selector, durMs: clamp(record.durationMs, DRAG_DUR_MIN_MS, DRAG_DUR_MAX_MS) };
      if (record.toSelector && record.toSelector !== record.selector) action.toSelector = record.toSelector;
      else { action.dx = Math.round(record.dx); action.dy = Math.round(record.dy); }
      this.emit(ops, action, record.firstAt, record.at, record.fingerprint);
    } else if (record.kind === 'change') {
      const action = this.changeAction(record);
      if (record.control === 'text') { if (this.pendingType?.selector === record.selector) this.finalizeType(ops); return ops; }
      this.finalizeType(ops);
      if (!action) return ops;
      /* Belt for label-wrapped custom controls the Recorder-level click filter missed: a change
         right after a same-target click means the click WAS this control interaction. */
      if (this.lastEmitted?.type === 'click' && this.lastEmitted.selector === record.selector && record.at - this.lastEmitted.at <= CHANGE_CLICK_MERGE_MS) {
        ops.push({ op: 'replaceLast', action });
        this.lastEmitted = { type: action.type, selector: record.selector, at: record.at };
        this.lastScroll = null; // replaced row is never a scroll, so the mirror must not point at it
      } else {
        this.emit(ops, action, record.at, record.at, record.fingerprint);
      }
    } else if (record.kind === 'submit') {
      this.finalizeType(ops);
    }
    return ops;
  }

  changeAction(record) {
    if (record.control === 'checkbox') return { type: 'toggle', definitionId: 'toggle', selector: record.selector, checked: !!record.checked };
    if (record.control === 'radio') return { type: 'click', definitionId: 'click', selector: record.selector };
    if (record.control === 'select') return { type: 'set', definitionId: 'set', selector: record.selector, value: record.value };
    if (record.control === 'range') return { type: 'lever', definitionId: 'lever', selector: record.selector, to: String(record.value), durMs: this.defaults('lever').durMs };
    if (record.control === 'value') return { type: 'set', definitionId: 'set', selector: record.selector, value: record.value };
    return null;
  }

  /* Route changed inside the preview. A navigation attributed to the immediately preceding click
     replaces that click with goto — the click's selector may not exist for validation on the new
     page, and goto is what actually reproduces what happened. */
  navigate(url, at) {
    const ops = this.flush();
    if (!url || url === this.route) return ops;
    this.route = url;
    const goto = { type: 'goto', definitionId: 'goto', url };
    if (this.lastEmitted?.type === 'click' && at - this.lastEmitted.at <= NAV_ATTRIBUTION_MS) {
      ops.push({ op: 'replaceLast', action: goto });
      this.lastEmitted = { type: 'goto', selector: null, at };
      this.lastScroll = null; // replaced row is never a scroll, so the mirror must not point at it
    } else {
      this.emit(ops, goto, at, at);
    }
    return ops;
  }

  /* A scroll burst never survives a flush: there is no future burst left to carry a remainder
     into, and no previous scroll to patch it onto (finalizeScroll already had its chance).
     Inventing an amount:0 action would be worse than dropping — it replays as a visible no-op
     that still costs durMs. */
  flush() { const ops = []; this.finalizeType(ops); this.finalizeScroll(ops); this.scrollCarry = null; return ops; }

  /* True only when the incoming delta reverses the OPEN burst's dominant axis and that burst is
     already big enough to be a real scroll. `direction` is a semantic field ('down'/'up'/...), so
     one action cannot express there-and-back — algebraic summing would silently delete BOTH
     halves of an explore-and-return. The size guard keeps trackpad rubber-banding (a stream of
     sub-floor wobbles) from splitting the burst into a chain of throwaway actions; comparing only
     on the open burst's dominant axis keeps diagonal trackpad drift from splitting anything. */
  reverses(record) {
    const pending = this.pendingScroll;
    if (!pending) return false;
    const vertical = Math.abs(pending.deltaY) >= Math.abs(pending.deltaX);
    const pendingDelta = vertical ? pending.deltaY : pending.deltaX;
    const incomingDelta = vertical ? record.deltaY : record.deltaX;
    if (pendingDelta === 0 || incomingDelta === 0 || Math.sign(pendingDelta) === Math.sign(incomingDelta)) return false;
    const basis = vertical ? pending.viewportH : pending.viewportW;
    const amount = basis ? Math.abs(pendingDelta) / basis * 100 : 0;
    return amount >= SCROLL_MIN_VIEWPORT_PERCENT;
  }

  /* Folds a parked sub-threshold remainder into the burst that just started, but ONLY the
     pixels — the carry's own firstAt is deliberately discarded in favour of the new burst's, so
     carried wall-clock cannot inflate durMs. Pacing across the gap is already modelled by the
     afterMs patch (or, for a merged tail, by span alone); durMs is an animation duration, not a
     stopwatch. */
  absorbCarry() {
    // Normalized on both sides, as `mergeable` does: the carry stores `?? null`, and a root-scroll
    // record can reach a Coalescer with no selector key at all, which must still match null.
    if (!this.scrollCarry || this.scrollCarry.selector !== (this.pendingScroll.selector ?? null)) return;
    this.pendingScroll.deltaX += this.scrollCarry.deltaX;
    this.pendingScroll.deltaY += this.scrollCarry.deltaY;
    this.scrollCarry = null;
  }

  finalizeType(ops) {
    if (!this.pendingType) return;
    const pending = this.pendingType; this.pendingType = null;
    const charMs = pending.gaps.length ? clamp(Math.round(median(pending.gaps)), CHAR_MS_MIN, CHAR_MS_MAX) : this.defaults('type').charMs;
    this.emit(ops, { type: 'type', definitionId: 'type', selector: pending.selector, text: pending.value, clearFirst: true, charMs }, pending.firstAt, pending.lastAt, pending.fingerprint);
  }

  finalizeScroll(ops) {
    if (!this.pendingScroll) return;
    const pending = this.pendingScroll; this.pendingScroll = null;
    const vertical = Math.abs(pending.deltaY) >= Math.abs(pending.deltaX);
    const delta = vertical ? pending.deltaY : pending.deltaX;
    const basis = vertical ? pending.viewportH : pending.viewportW;
    const amount = basis ? Math.round(Math.abs(delta) / basis * 100) : 0;
    const direction = vertical ? (delta > 0 ? 'down' : 'up') : (delta > 0 ? 'right' : 'left');
    const span = pending.lastAt - pending.firstAt;
    if (amount === 0) return; // genuinely no movement — nothing to emit, nothing to carry

    if (amount >= SCROLL_MIN_VIEWPORT_PERCENT) {
      /* A full-size burst ALWAYS appends its own action, even when it could patch onto the
         previous scroll: two same-direction bursts separated by more than the burst gap are two
         beats of the demo, and the pause between them is worth replaying as its own afterMs.
         Only sub-threshold remainders (below) merge into what came before. */
      const durMs = clamp(span, SCROLL_DUR_MIN_MS, SCROLL_DUR_MAX_MS);
      const action = { type: 'scroll', definitionId: 'scroll-by', mode: 'relative', direction, amount, unit: 'viewportPercent', durMs };
      if (pending.selector) action.selector = pending.selector;
      this.emit(ops, action, pending.firstAt, pending.lastAt);
      return;
    }

    const mergeable = this.lastScroll && this.lastEmitted?.type === 'scroll' && this.lastScroll.selector === (pending.selector ?? null) && this.lastScroll.direction === direction;
    if (mergeable) {
      /* This path deliberately never calls emit(): emittedCount stays put and no afterMs patch
         is produced, because an intra-scroll gap must never be charged to the previous action. */
      const amountPatch = this.lastScroll.amount + amount;
      // durMs adds only this tail's own span, not the gap before it — durMs is an animation
      // duration, not wall-clock, so the pause leading into the tail must not inflate it.
      const durMsPatch = clamp(this.lastScroll.durMs + span, SCROLL_DUR_MIN_MS, SCROLL_DUR_MAX_MS);
      ops.push({ op: 'patchLast', patch: { amount: amountPatch, durMs: durMsPatch } });
      this.lastScroll.amount = amountPatch; this.lastScroll.durMs = durMsPatch;
      /* Without this, the gap before this tail would later be charged as afterMs on the scroll
         itself when the next action emits — exactly the "3s scroll replays as 8-10s" symptom. */
      this.lastEmitted.at = pending.lastAt;
      return;
    }

    /* Sub-threshold with nowhere to merge yet: park it. Five small flicks spread over several
       seconds are each individually invisible, but dropping every one of them (the old
       amount < MIN early-return) makes the whole scroll vanish — carry it forward instead. */
    this.scrollCarry = { selector: pending.selector ?? null, deltaX: pending.deltaX, deltaY: pending.deltaY, viewportW: pending.viewportW, viewportH: pending.viewportH };
  }

  /* Idle gaps between interactions become afterMs on the PREVIOUS action, so replay keeps the
     author's pacing without inventing pauses they didn't take. */
  emit(ops, action, firstAt, lastAt, fingerprint) {
    if (fingerprint && action.selector) action.fingerprint = fingerprint;
    if (this.emittedCount > 0 && this.lastEmitted) {
      const gap = firstAt - this.lastEmitted.at;
      if (gap >= IDLE_GAP_MIN_MS) ops.push({ op: 'patchLast', patch: { afterMs: Math.min(Math.round(gap / IDLE_GAP_ROUND_MS) * IDLE_GAP_ROUND_MS, IDLE_GAP_MAX_MS) } });
    }
    ops.push({ op: 'append', action });
    this.lastEmitted = { type: action.type, selector: action.selector ?? null, at: lastAt };
    // Self-clears on any non-scroll append, so a later patchLast can never hit the wrong row.
    this.lastScroll = action.type === 'scroll' ? { selector: action.selector ?? null, direction: action.direction, amount: action.amount, durMs: action.durMs } : null;
    this.emittedCount += 1;
  }
}

/* DOM edge. Attaches capture-phase listeners to the preview document, filters to trusted
   user-initiated events, normalizes them into records for the Coalescer, and re-attaches across
   same-origin navigations via the frame's own load event (the frame element lives in the parent
   document, so that one listener survives). */
export class Recorder {
  constructor({ frame, core, banner, onOp, onStop, route, shouldStopOnEscape }) {
    this.frame = frame; this.core = core; this.banner = banner;
    this.onOp = onOp || (() => {}); this.onStop = onStop || (() => {});
    /* Escape is shared with Studio's ⌘-hold gesture, whose listener sits on the same frame window in
       capture phase — and their relative order is re-derived on every frame load. Asking the owner
       is stable where listener order is not. */
    this.shouldStopOnEscape = shouldStopOnEscape || (() => true);
    this.definitionDefaults = (id) => core.getDefinition(id)?.defaults || {};
    this.coalescer = new Coalescer({ definitionDefaults: this.definitionDefaults, route });
    this.active = false; this.teardown = []; this.scrollTimer = null; this.pendingPointer = null; this.ignoreClickUntil = 0;
    // WeakMap over Map for both: a Map keyed by element leaks detached containers for the life
    // of the session (removed panels, torn-down SPA routes, ...) since nothing ever deletes the
    // entry; WeakMap lets them be collected once nothing else references them. `doc` is a valid
    // WeakMap key too, so the root-scroll baseline gets the same treatment.
    this.scrollPositions = new WeakMap();
    this.scrollSelectorMemo = new WeakMap(); // element -> selector ('' caches an unselectable container)
    this.onFrameLoad = () => this.handleNavigation();
  }

  start() {
    const doc = this.frame?.contentDocument;
    if (!doc) return false;
    this.active = true;
    this.attach(doc);
    this.frame.addEventListener('load', this.onFrameLoad);
    if (this.banner) { this.banner.hidden = false; this.banner.textContent = `Recording — ${RECORDING_KEYS}`; }
    return true;
  }

  stop(reason) {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.scrollTimer);
    this.apply(this.coalescer.flush());
    this.detach();
    this.frame.removeEventListener('load', this.onFrameLoad);
    if (this.banner) this.banner.hidden = true;
    this.onStop(reason);
  }

  /* Undo is a recording boundary, not just an array pop. Flush first so an open typing or scroll
     burst is the thing the author just saw and expects to remove, then reset coalescing history so
     the next interaction cannot patch timing onto an action that no longer exists. */
  undo() {
    if (!this.active) return;
    clearTimeout(this.scrollTimer);
    this.apply(this.coalescer.flush());
    this.onOp({ op: 'removeLast' });
    this.coalescer = new Coalescer({ definitionDefaults: this.definitionDefaults, route: this.coalescer.route });
  }

  apply(ops) { for (const op of ops) this.onOp(op); }

  attach(doc) {
    const win = doc.defaultView;
    const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); this.teardown.push(() => target.removeEventListener(type, handler, options)); };
    /* No modifier-click handler here: Studio's GestureHighlighter owns that gesture for the whole
       editor view and commits through annotate() below, so one implementation serves a running take
       and an idle preview alike. Its click listener sits on the frame WINDOW in capture phase while
       handleClick sits on the frame DOCUMENT in capture, and window-capture structurally precedes
       document-capture — so a swallowed ⌘-click can never also record a click, whatever order the
       two were registered in. One limitation stands: a host listener already on window-capture
       before Studio armed still runs first. */
    on(doc, 'click', (e) => this.handleClick(e), true);
    on(doc, 'pointerdown', (e) => this.handlePointerDown(e), { capture: true, passive: true });
    on(doc, 'pointerup', (e) => this.handlePointerUp(e), { capture: true, passive: true });
    on(doc, 'pointercancel', () => { this.pendingPointer = null; }, { capture: true, passive: true });
    on(doc, 'change', (e) => this.handleChange(e), true);
    on(doc, 'submit', (e) => { if (e.isTrusted) this.apply(this.coalescer.push({ kind: 'submit', at: Date.now() })); }, true);
    on(doc, 'input', (e) => this.handleInput(e), { capture: true, passive: true });
    on(doc, 'scroll', (e) => this.handleScroll(e), { capture: true, passive: true });
    on(win, 'keydown', (e) => { if (e.key === 'Escape' && this.shouldStopOnEscape()) this.stop(); }, true);
    on(win, 'hashchange', () => this.handleNavigation(), false);
    on(win, 'popstate', () => this.handleNavigation(), false);
    for (const method of ['pushState', 'replaceState']) {
      const original = win.history[method];
      win.history[method] = (...args) => { const result = original.apply(win.history, args); queueMicrotask(() => this.handleNavigation()); return result; };
      this.teardown.push(() => { win.history[method] = original; });
    }
    this.doc = doc;
  }

  /* WeakMap has no .clear(), so a fresh page needs a fresh map — reassigning is also required
     for correctness, not just cleanup: after a navigation the scroll baseline must be
     re-established, or the first post-nav scroll event diffs against the OLD page's scrollTop
     and produces a bogus delta. */
  detach() { for (const fn of this.teardown.splice(0)) fn(); this.doc = null; this.scrollPositions = new WeakMap(); this.scrollSelectorMemo = new WeakMap(); }

  handleNavigation() {
    if (!this.active) return;
    let route;
    try {
      const url = new URL(this.frame.contentWindow.location.href);
      url.searchParams.delete('screenreelPreview');
      route = this.core.normalizeRoute(`${url.pathname}${url.search}${url.hash}`, location.href);
    } catch {
      return this.stop('Recording stopped — the preview left this origin');
    }
    this.detach();
    this.apply(this.coalescer.navigate(route, Date.now()));
    const doc = this.frame.contentDocument;
    if (!doc) return this.stop('Recording stopped — preview document is unavailable');
    this.attach(doc);
    if (this.banner && route) this.banner.textContent = `Recording continues on ${route} · ${RECORDING_KEYS}`;
  }

  /* Overlay chrome (ScreenReel's own boxes, ripples, cursor) must never record. */
  isOverlayTarget(el) { return !!(el.closest?.('[class^="sr-"],[class*=" sr-"]') || el.closest?.('#__screenreelCursor')); }

  /* Resolved selector plus the target's fingerprint: without the fingerprint, `flow doctor`
     cannot re-match a recorded action after the app renames its selector. */
  targetOf(el) {
    const resolved = this.core.resolvePickerTarget(el, 'interactive', this.doc) || el;
    return { selector: this.core.selectorFor(resolved), fingerprint: this.core.fingerprintFor(resolved) };
  }

  /* A highlight/spotlight added by Studio's ⌘-hold gesture during a take. It goes through the
     coalescer rather than straight to the timeline so the take stays ONE sequence: the idle gap
     before it still lands as afterMs on the previous action, and a typing burst still finalizes
     ahead of it. Ignored when no take is running — Studio appends directly in that case. */
  annotate({ annotation, selector, fingerprint }) {
    if (!this.active) return;
    this.apply(this.coalescer.push({ kind: 'annotate', annotation, at: Date.now(), selector, fingerprint }));
  }

  handleClick(event) {
    if (!event.isTrusted || !this.active) return;
    if (Date.now() <= this.ignoreClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const target = event.target;
    if (!target || this.isOverlayTarget(target)) return;
    /* Controls that speak through input/change events must not double-emit via their click. */
    const control = target.closest?.('input,select,option,textarea');
    if (control && !(control.tagName === 'INPUT' && CLICK_KEEP_INPUT_TYPES.includes(control.type))) return;
    const label = target.closest?.('label');
    const labelled = label ? (label.control || label.querySelector('input,select,textarea')) : null;
    if (labelled && !(labelled.tagName === 'INPUT' && CLICK_KEEP_INPUT_TYPES.includes(labelled.type))) return;
    const { selector, fingerprint } = this.targetOf(target);
    if (!selector) return;
    this.apply(this.coalescer.push({ kind: 'click', at: Date.now(), selector, fingerprint }));
  }

  handlePointerDown(event) {
    if (!event.isTrusted || !this.active || event.button !== 0 || this.isOverlayTarget(event.target)) return;
    const { selector, fingerprint } = this.targetOf(event.target); if (!selector) return;
    this.pendingPointer = { pointerId: event.pointerId, selector, fingerprint, x: event.clientX, y: event.clientY, at: Date.now() };
  }

  handlePointerUp(event) {
    const start = this.pendingPointer; this.pendingPointer = null;
    if (!event.isTrusted || !this.active || !start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < DRAG_MIN_DISTANCE_PX) return;
    const destination = this.core.resolvePickerTarget(event.target, 'visual', this.doc) || event.target;
    const toSelector = this.core.selectorFor(destination) || null; const at = Date.now();
    this.ignoreClickUntil = at + CHANGE_CLICK_MERGE_MS;
    this.apply(this.coalescer.push({ kind: 'drag', firstAt: start.at, at, selector: start.selector, fingerprint: start.fingerprint, toSelector, dx, dy, durationMs: at - start.at }));
  }

  handleInput(event) {
    if (!event.isTrusted || !this.active) return;
    const el = event.target;
    if (!el || this.isOverlayTarget(el)) return;
    const isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes(el.type));
    if (!isText || SENSITIVE_INPUT_TYPES.includes(el.type)) return;
    const { selector, fingerprint } = this.targetOf(el);
    if (!selector) return;
    this.apply(this.coalescer.push({ kind: 'input', at: Date.now(), selector, fingerprint, value: el.value }));
  }

  handleChange(event) {
    if (!event.isTrusted || !this.active) return;
    const el = event.target;
    if (!el || this.isOverlayTarget(el) || SENSITIVE_INPUT_TYPES.includes(el.type) || el.type === 'file') return;
    const { selector, fingerprint } = this.targetOf(el);
    if (!selector) return;
    const record = { kind: 'change', at: Date.now(), selector, fingerprint, value: el.value, checked: el.checked };
    if (el.tagName === 'SELECT') record.control = 'select';
    else if (el.type === 'checkbox') record.control = 'checkbox';
    else if (el.type === 'radio') record.control = 'radio';
    else if (el.type === 'range') record.control = 'range';
    else if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes(el.type))) record.control = 'text';
    else record.control = 'value';
    this.apply(this.coalescer.push(record));
  }

  /* No isTrusted guard here, unlike the other handlers above: element.scrollTo() dispatches
     trusted scroll events too, so checking isTrusted would filter out nothing a programmatic
     scroll couldn't already fake. */
  handleScroll(event) {
    if (!this.active) return;
    const doc = this.doc; const win = doc.defaultView;
    const raw = event.target;
    const isRoot = raw === doc || raw === doc.documentElement || raw === doc.body;
    const el = isRoot ? null : raw;
    if (el && this.isOverlayTarget(el)) return;
    const top = el ? el.scrollTop : win.scrollY;
    const left = el ? el.scrollLeft : win.scrollX;
    const key = el || doc;
    const previous = this.scrollPositions.get(key);
    this.scrollPositions.set(key, { top, left });
    if (!previous) return; // first event of a container establishes the baseline
    let selector = null;
    if (el) {
      // Cache '' for an unselectable container too, so it isn't re-walked on every scroll event.
      if (!this.scrollSelectorMemo.has(el)) this.scrollSelectorMemo.set(el, this.core.selectorFor(el) || '');
      selector = this.scrollSelectorMemo.get(el) || null;
      if (!selector) return;
    }
    this.apply(this.coalescer.push({ kind: 'scroll', at: Date.now(), selector, deltaX: left - previous.left, deltaY: top - previous.top, viewportW: win.innerWidth, viewportH: win.innerHeight }));
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => { if (this.active) this.apply(this.coalescer.flush()); }, SCROLL_FLUSH_MS);
  }
}
