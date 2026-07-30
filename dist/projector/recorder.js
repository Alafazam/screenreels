/* Record-by-doing for ScreenReel Studio: the user interacts with the preview iframe and the
   interactions become flow actions. Two layers, one file:
   - Coalescer: pure event-record → action logic (no DOM), unit-testable under node --test.
   - Recorder: DOM edge — normalizes trusted iframe events into plain records, survives
     in-frame navigations, and applies the coalescer's ops through Studio callbacks. */

/* Timing and thresholds. Canonical per-action defaults (charMs 45, lever durMs 1200, …) are NOT
   re-declared here — the Coalescer reads them through the injected definitionDefaults lookup so
   the action registry stays the single source of truth. */
export const SCROLL_SETTLE_MS = 350;          // quiet gap that ends a scroll burst
export const IDLE_GAP_MIN_MS = 300;           // pauses shorter than this are not worth replaying
export const IDLE_GAP_MAX_MS = 5000;          // cap replayed pauses; nobody wants a 30s afterMs
export const IDLE_GAP_ROUND_MS = 100;         // round pauses so manifests stay tidy
export const CHAR_MS_MIN = 20;                // clamp measured typing speed to a watchable range
export const CHAR_MS_MAX = 200;
export const NAV_ATTRIBUTION_MS = 1500;       // a navigation this soon after a click IS that click
export const CHANGE_CLICK_MERGE_MS = 120;     // change this soon after a same-target click replaces it
export const SCROLL_MIN_VIEWPORT_PERCENT = 2; // ignore sub-2% scroll noise
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
    this.lastEmitted = null;    // { type, selector, at } of the last appended action
    this.emittedCount = 0;
  }

  push(record) {
    const ops = [];
    if (record.kind === 'scroll') {
      this.finalizeType(ops);
      const sameBurst = this.pendingScroll && this.pendingScroll.selector === record.selector && record.at - this.pendingScroll.lastAt <= SCROLL_SETTLE_MS;
      if (sameBurst) {
        this.pendingScroll.deltaX += record.deltaX; this.pendingScroll.deltaY += record.deltaY; this.pendingScroll.lastAt = record.at;
      } else {
        this.finalizeScroll(ops);
        this.pendingScroll = { selector: record.selector, deltaX: record.deltaX, deltaY: record.deltaY, firstAt: record.at, lastAt: record.at, viewportW: record.viewportW, viewportH: record.viewportH };
      }
      return ops;
    }
    this.finalizeScroll(ops);
    if (record.kind === 'input') {
      if (this.pendingType && this.pendingType.selector === record.selector) {
        this.pendingType.gaps.push(record.at - this.pendingType.lastAt);
        this.pendingType.value = record.value; this.pendingType.lastAt = record.at;
      } else {
        this.finalizeType(ops);
        this.pendingType = { selector: record.selector, value: record.value, firstAt: record.at, lastAt: record.at, gaps: [] };
      }
    } else if (record.kind === 'click') {
      this.finalizeType(ops);
      this.emit(ops, { type: 'click', definitionId: 'click', selector: record.selector }, record.at, record.at);
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
      } else {
        this.emit(ops, action, record.at, record.at);
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
    } else {
      this.emit(ops, goto, at, at);
    }
    return ops;
  }

  flush() { const ops = []; this.finalizeType(ops); this.finalizeScroll(ops); return ops; }

  finalizeType(ops) {
    if (!this.pendingType) return;
    const pending = this.pendingType; this.pendingType = null;
    const charMs = pending.gaps.length ? clamp(Math.round(median(pending.gaps)), CHAR_MS_MIN, CHAR_MS_MAX) : this.defaults('type').charMs;
    this.emit(ops, { type: 'type', definitionId: 'type', selector: pending.selector, text: pending.value, clearFirst: true, charMs }, pending.firstAt, pending.lastAt);
  }

  finalizeScroll(ops) {
    if (!this.pendingScroll) return;
    const pending = this.pendingScroll; this.pendingScroll = null;
    const vertical = Math.abs(pending.deltaY) >= Math.abs(pending.deltaX);
    const delta = vertical ? pending.deltaY : pending.deltaX;
    const basis = vertical ? pending.viewportH : pending.viewportW;
    const amount = basis ? Math.round(Math.abs(delta) / basis * 100) : 0;
    if (amount < SCROLL_MIN_VIEWPORT_PERCENT) return;
    const action = { type: 'scroll', definitionId: 'scroll-by', mode: 'relative', direction: vertical ? (delta > 0 ? 'down' : 'up') : (delta > 0 ? 'right' : 'left'), amount, unit: 'viewportPercent', durMs: this.defaults('scroll-by').durMs };
    if (pending.selector) action.selector = pending.selector;
    this.emit(ops, action, pending.firstAt, pending.lastAt);
  }

  /* Idle gaps between interactions become afterMs on the PREVIOUS action, so replay keeps the
     author's pacing without inventing pauses they didn't take. */
  emit(ops, action, firstAt, lastAt) {
    if (this.emittedCount > 0 && this.lastEmitted) {
      const gap = firstAt - this.lastEmitted.at;
      if (gap >= IDLE_GAP_MIN_MS) ops.push({ op: 'patchLast', patch: { afterMs: Math.min(Math.round(gap / IDLE_GAP_ROUND_MS) * IDLE_GAP_ROUND_MS, IDLE_GAP_MAX_MS) } });
    }
    ops.push({ op: 'append', action });
    this.lastEmitted = { type: action.type, selector: action.selector ?? null, at: lastAt };
    this.emittedCount += 1;
  }
}

/* DOM edge. Attaches capture-phase listeners to the preview document, filters to trusted
   user-initiated events, normalizes them into records for the Coalescer, and re-attaches across
   same-origin navigations via the frame's own load event (the frame element lives in the parent
   document, so that one listener survives). */
export class Recorder {
  constructor({ frame, core, banner, onOp, onStop, route }) {
    this.frame = frame; this.core = core; this.banner = banner;
    this.onOp = onOp || (() => {}); this.onStop = onStop || (() => {});
    this.coalescer = new Coalescer({ definitionDefaults: (id) => core.getDefinition(id)?.defaults || {}, route });
    this.active = false; this.teardown = []; this.scrollTimer = null;
    this.scrollPositions = new Map(); this.scrollSelectorCache = null;
    this.onFrameLoad = () => this.handleNavigation();
  }

  start() {
    const doc = this.frame?.contentDocument;
    if (!doc) return false;
    this.active = true;
    this.attach(doc);
    this.frame.addEventListener('load', this.onFrameLoad);
    if (this.banner) { this.banner.hidden = false; this.banner.textContent = 'Recording — interact with the preview · Esc stops'; }
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

  apply(ops) { for (const op of ops) this.onOp(op); }

  attach(doc) {
    const win = doc.defaultView;
    const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); this.teardown.push(() => target.removeEventListener(type, handler, options)); };
    on(doc, 'click', (e) => this.handleClick(e), true);
    on(doc, 'change', (e) => this.handleChange(e), true);
    on(doc, 'submit', (e) => { if (e.isTrusted) this.apply(this.coalescer.push({ kind: 'submit', at: Date.now() })); }, true);
    on(doc, 'input', (e) => this.handleInput(e), { capture: true, passive: true });
    on(doc, 'scroll', (e) => this.handleScroll(e), { capture: true, passive: true });
    on(win, 'keydown', (e) => { if (e.key === 'Escape') this.stop(); }, true);
    on(win, 'hashchange', () => this.handleNavigation(), false);
    this.doc = doc;
  }

  detach() { for (const fn of this.teardown.splice(0)) fn(); this.doc = null; this.scrollPositions.clear(); this.scrollSelectorCache = null; }

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
    if (this.banner && route) this.banner.textContent = `Recording continues on ${route} · Esc stops`;
  }

  /* Overlay chrome (ScreenReel's own boxes, ripples, cursor) must never record. */
  isOverlayTarget(el) { return !!(el.closest?.('[class^="sr-"],[class*=" sr-"]') || el.closest?.('#__screenreelCursor')); }

  selectorOf(el) {
    const resolved = this.core.resolvePickerTarget(el, 'interactive', this.doc) || el;
    return this.core.selectorFor(resolved);
  }

  handleClick(event) {
    if (!event.isTrusted || !this.active) return;
    const target = event.target;
    if (!target || this.isOverlayTarget(target)) return;
    /* Controls that speak through input/change events must not double-emit via their click. */
    const control = target.closest?.('input,select,option,textarea');
    if (control && !(control.tagName === 'INPUT' && CLICK_KEEP_INPUT_TYPES.includes(control.type))) return;
    const label = target.closest?.('label');
    const labelled = label ? (label.control || label.querySelector('input,select,textarea')) : null;
    if (labelled && !(labelled.tagName === 'INPUT' && CLICK_KEEP_INPUT_TYPES.includes(labelled.type))) return;
    const selector = this.selectorOf(target);
    if (!selector) return;
    this.apply(this.coalescer.push({ kind: 'click', at: Date.now(), selector }));
  }

  handleInput(event) {
    if (!event.isTrusted || !this.active) return;
    const el = event.target;
    if (!el || this.isOverlayTarget(el)) return;
    const isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes(el.type));
    if (!isText || SENSITIVE_INPUT_TYPES.includes(el.type)) return;
    const selector = this.selectorOf(el);
    if (!selector) return;
    this.apply(this.coalescer.push({ kind: 'input', at: Date.now(), selector, value: el.value }));
  }

  handleChange(event) {
    if (!event.isTrusted || !this.active) return;
    const el = event.target;
    if (!el || this.isOverlayTarget(el) || SENSITIVE_INPUT_TYPES.includes(el.type) || el.type === 'file') return;
    const selector = this.selectorOf(el);
    if (!selector) return;
    const record = { kind: 'change', at: Date.now(), selector, value: el.value, checked: el.checked };
    if (el.tagName === 'SELECT') record.control = 'select';
    else if (el.type === 'checkbox') record.control = 'checkbox';
    else if (el.type === 'radio') record.control = 'radio';
    else if (el.type === 'range') record.control = 'range';
    else if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes(el.type))) record.control = 'text';
    else record.control = 'value';
    this.apply(this.coalescer.push(record));
  }

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
      if (this.scrollSelectorCache?.el !== el) this.scrollSelectorCache = { el, selector: this.core.selectorFor(el) };
      selector = this.scrollSelectorCache.selector;
      if (!selector) return;
    }
    this.apply(this.coalescer.push({ kind: 'scroll', at: Date.now(), selector, deltaX: left - previous.left, deltaY: top - previous.top, viewportW: win.innerWidth, viewportH: win.innerHeight }));
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => { if (this.active) this.apply(this.coalescer.flush()); }, SCROLL_SETTLE_MS);
  }
}
