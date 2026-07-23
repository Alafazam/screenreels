/* ScreenReel shared action registry, selector tooling, validation, and executor. */
(function initScreenReelCore(root) {
  if (root.ScreenReelCore) return;

  const field = (key, label, type = 'number', extra = {}) => ({ key, label, type, ...extra });
  const definitions = [
    { id: 'highlight', type: 'highlight', category: 'Emphasis', label: 'Highlight target', picker: 'visual', defaults: { holdMs: 1600 }, fields: [field('holdMs', 'Highlight time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'highlight-sequence', type: 'glow', category: 'Emphasis', label: 'Highlight target sequence', picker: 'collection', defaults: { sequence: true, count: 6, stepMs: 1050, afterMs: 400 }, fields: [field('count', 'Maximum targets', 'number', { min: 1, max: 30 }), field('stepMs', 'Time per target (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'spotlight', type: 'spotlight', category: 'Emphasis', label: 'Spotlight target', picker: 'visual', defaults: { holdMs: 1800, dim: 0.62 }, fields: [field('holdMs', 'Spotlight time (ms)', 'number', { min: 100, max: 30000 }), field('dim', 'Background dimming', 'number', { min: 0.1, max: 0.9, step: 0.05 })] },
    { id: 'callout', type: 'callout', category: 'Emphasis', label: 'Target callout', picker: 'visual', defaults: { text: 'Add your callout', placement: 'auto', holdMs: 2200 }, fields: [field('text', 'Callout text', 'textarea'), field('placement', 'Placement', 'select', { options: ['auto', 'top', 'right', 'bottom', 'left'] }), field('holdMs', 'Callout time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'click', type: 'click', category: 'Interaction', label: 'Click target', picker: 'interactive', defaults: { afterMs: 700 }, fields: [] },
    { id: 'hover', type: 'hover', category: 'Interaction', label: 'Hover target', picker: 'interactive', defaults: { holdMs: 800 }, fields: [field('holdMs', 'Hover time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'focus', type: 'focus', category: 'Interaction', label: 'Focus target', picker: 'interactive', defaults: { afterMs: 500 }, fields: [] },
    { id: 'type', type: 'type', category: 'Interaction', label: 'Type into field', picker: 'interactive', defaults: { text: 'Sample value', clearFirst: true, charMs: 45 }, fields: [field('text', 'Text to type', 'textarea'), field('clearFirst', 'Clear existing value first', 'checkbox'), field('charMs', 'Time per character (ms)', 'number', { min: 0, max: 1000 })] },
    { id: 'set', type: 'set', category: 'Interaction', label: 'Set control value', picker: 'interactive', defaults: { value: '' }, fields: [field('value', 'Value', 'text')] },
    { id: 'toggle', type: 'toggle', category: 'Interaction', label: 'Toggle control', picker: 'interactive', defaults: { checked: true }, fields: [field('checked', 'Finish enabled', 'checkbox')] },
    { id: 'lever', type: 'lever', category: 'Interaction', label: 'Move slider', picker: 'interactive', defaults: { to: 'max', durMs: 1200 }, fields: [field('to', 'Target (min, max, or value)', 'text'), field('durMs', 'Movement time (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'drag', type: 'drag', category: 'Interaction', label: 'Drag target', picker: 'source-destination', defaults: { durMs: 900 }, fields: [field('toSelector', 'Destination selector', 'text'), field('dx', 'Fallback X distance (px)', 'number', { min: -5000, max: 5000 }), field('dy', 'Fallback Y distance (px)', 'number', { min: -5000, max: 5000 }), field('durMs', 'Drag time (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'scroll-target', type: 'scrollIntoView', category: 'Viewport', label: 'Scroll target into view', picker: 'visual', defaults: { block: 'center', durMs: 700 }, fields: [field('block', 'Alignment', 'select', { options: ['start', 'center', 'end', 'nearest'] }), field('durMs', 'Scroll time (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'scroll-by', type: 'scroll', category: 'Viewport', label: 'Scroll by amount', picker: 'none', defaults: { mode: 'relative', direction: 'down', amount: 50, unit: 'viewportPercent', durMs: 800 }, fields: [field('selector', 'Container selector (optional)', 'text'), field('direction', 'Direction', 'select', { options: ['down', 'up', 'right', 'left'] }), field('amount', 'Amount', 'number', { min: 0, max: 10000 }), field('unit', 'Unit', 'select', { options: ['viewportPercent', 'pagePercent', 'pixels'] }), field('durMs', 'Scroll time (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'scroll-edge', type: 'scroll', category: 'Viewport', label: 'Scroll to edge', picker: 'none', defaults: { mode: 'edge', edge: 'top', durMs: 700 }, fields: [field('selector', 'Container selector (optional)', 'text'), field('edge', 'Edge', 'select', { options: ['top', 'bottom', 'left', 'right'] }), field('durMs', 'Scroll time (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'wait', type: 'wait', category: 'Timing', label: 'Wait duration', picker: 'none', defaults: { ms: 1000 }, fields: [field('ms', 'Wait time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'wait-for', type: 'waitFor', category: 'Timing', label: 'Wait for target or state', picker: 'visual', defaults: { condition: 'visible', timeoutMs: 8000 }, fields: [field('condition', 'Condition', 'select', { options: ['appear', 'disappear', 'visible', 'enabled', 'selected'] }), field('timeoutMs', 'Timeout (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'goto', type: 'goto', category: 'Navigation', label: 'Navigate', picker: 'none', defaults: { url: '/' }, fields: [field('url', 'Local route', 'text')] },
    { id: 'pointer', type: 'pointer', category: 'Advanced', label: 'Pointer tap', picker: 'interactive', advanced: true, defaults: { afterMs: 700 }, fields: [] },
    { id: 'call', type: 'call', category: 'Advanced', label: 'Call page function', picker: 'none', advanced: true, defaults: { fn: '', args: [], afterMs: 700 }, fields: [field('fn', 'Function name', 'text'), field('args', 'Arguments (JSON array)', 'json'), field('cursorTo', 'Cursor target selector (optional)', 'text')] },
  ];
  const recipes = [
    { id: 'scroll-explain', label: 'Scroll and explain', picker: 'visual', build: ({ selector }) => [{ type: 'scrollIntoView', selector, block: 'center', durMs: 700 }, { type: 'highlight', selector, holdMs: 1600 }, { type: 'wait', ms: 700 }] },
    { id: 'open-spotlight', label: 'Open and spotlight', picker: 'source-destination', build: ({ selector, toSelector }) => [{ type: 'click', selector, afterMs: 500 }, { type: 'waitFor', selector: toSelector, condition: 'visible', timeoutMs: 8000 }, { type: 'spotlight', selector: toSelector, holdMs: 1800, dim: 0.62 }] },
    { id: 'kpi-walkthrough', label: 'KPI walkthrough', picker: 'collection', build: ({ selector }) => [{ type: 'glow', selector, sequence: true, count: 6, stepMs: 1050, afterMs: 400 }] },
    { id: 'fill-submit', label: 'Fill and submit', picker: 'source-destination', build: ({ selector, toSelector }) => [{ type: 'focus', selector }, { type: 'type', selector, text: 'Sample value', clearFirst: true, charMs: 45 }, { type: 'click', selector: toSelector, afterMs: 700 }] },
    { id: 'compare-lever', label: 'Compare a lever', picker: 'interactive', build: ({ selector }) => [{ type: 'lever', selector, to: 'max', durMs: 900 }, { type: 'wait', ms: 500 }, { type: 'lever', selector, to: 'min', durMs: 900 }, { type: 'wait', ms: 500 }, { type: 'lever', selector, to: 'max', durMs: 900 }] },
    { id: 'drag-inspect', label: 'Drag and inspect', picker: 'source-destination', build: ({ selector, toSelector }) => [{ type: 'highlight', selector, holdMs: 800 }, { type: 'drag', selector, toSelector, durMs: 900 }, { type: 'spotlight', selector: toSelector, holdMs: 1600, dim: 0.58 }] },
  ];

  const byId = new Map(definitions.map((item) => [item.id, item]));
  const aliases = { fill: 'type' };
  const supportedTypes = new Set(definitions.map((item) => item.type).concat(['fill', 'glow']));
  const sleep = (ms, signal) => new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, Number(ms) || 0));
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  const actionType = (action) => aliases[action?.type] || action?.type;
  function definitionForAction(action) {
    if (action?.definitionId && byId.has(action.definitionId)) return byId.get(action.definitionId);
    const type = actionType(action);
    if (type === 'glow') return byId.get(action.sequence ? 'highlight-sequence' : 'highlight');
    if (type === 'scroll') return byId.get(action.mode === 'relative' ? 'scroll-by' : 'scroll-edge');
    return definitions.find((item) => item.type === type) || null;
  }
  function normalizeRoute(route, baseHref) {
    const raw = String(route || '').trim();
    if (!raw || raw.includes('..') || /^(?:javascript|data):/i.test(raw)) return null;
    try {
      const base = new URL(baseHref || 'http://screenreel.local/'); const url = new URL(raw, base);
      if (url.origin !== base.origin) return null;
      url.searchParams.delete('demo'); url.searchParams.delete('screenreelPreview');
      return `${url.pathname}${url.search}${url.hash}`;
    } catch { return null; }
  }
  function queryAll(doc, selector) { try { return selector ? [...doc.querySelectorAll(selector)] : []; } catch { return []; } }
  function resolveElement(doc, action, selector = action.selector) { return queryAll(doc, selector)[Number(action.index) || 0] || null; }
  async function waitFor(doc, selector, condition = 'appear', timeoutMs = 8000, signal) {
    const started = Date.now();
    while (!signal?.aborted && Date.now() - started <= timeoutMs) {
      const el = selector ? resolveElement(doc, { selector }) : doc.body; const style = el ? doc.defaultView.getComputedStyle(el) : null;
      const visible = !!el && style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
      const met = condition === 'disappear' ? !el : condition === 'visible' ? visible : condition === 'enabled' ? visible && !el.disabled : condition === 'selected' ? !!el && (el.checked || el.selected || el.getAttribute('aria-selected') === 'true') : !!el;
      if (met) return el || true; await sleep(120, signal);
    }
    return null;
  }
  function ensureStyles(doc) {
    if (doc.getElementById('__screenreelActionStyles')) return;
    const style = doc.createElement('style'); style.id = '__screenreelActionStyles';
    style.textContent = '@property --sr-angle{syntax:"<angle>";initial-value:0deg;inherits:false}.sr-action-box,.sr-glow-box{position:fixed;z-index:2147483000;pointer-events:none;border-radius:14px;border:3px solid #7c3aed;box-shadow:0 0 0 2px rgba(255,255,255,.86),0 0 24px rgba(124,58,237,.48);transition:all .32s ease}.sr-glow-box{border-color:transparent;background:conic-gradient(from var(--sr-angle),#ff5e5e,#ffb84d,#ffe74d,#6ef08c,#4dc9ff,#7c6ef0,#d05ef0,#ff5ec8,#ff5e5e) border-box;-webkit-mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);mask-composite:exclude;animation:sr-spin 2s linear infinite}@keyframes sr-spin{to{--sr-angle:360deg}}.sr-action-callout{position:fixed;z-index:2147483001;max-width:280px;padding:9px 11px;border-radius:8px;background:#18181b;color:#fff;font:600 12px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.3);pointer-events:none}.sr-click-ripple{position:fixed;z-index:2147483100;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#7c3aed;pointer-events:none;animation:sr-ripple .65s ease-out forwards}@keyframes sr-ripple{to{opacity:0;transform:scale(3.2)}}';
    doc.head.appendChild(style);
  }
  function placeBox(box, el) { const rect = el.getBoundingClientRect(); Object.assign(box.style, { left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${rect.width + 10}px`, height: `${rect.height + 10}px` }); }
  function dispatchValue(el, value) { const EventCtor = el.ownerDocument.defaultView.Event; el.value = value; el.dispatchEvent(new EventCtor('input', { bubbles: true })); el.dispatchEvent(new EventCtor('change', { bubbles: true })); }
  function ripple(doc, el) { ensureStyles(doc); const rect = el.getBoundingClientRect(); const dot = doc.createElement('div'); dot.className = 'sr-click-ripple'; dot.style.left = `${rect.left + rect.width / 2}px`; dot.style.top = `${rect.top + rect.height / 2}px`; doc.body.appendChild(dot); setTimeout(() => dot.remove(), 700); }
  async function runGlow(action, ctx) {
    const elements = queryAll(ctx.document, action.selector).slice(0, Number(action.count) || 12); if (!elements.length) return false;
    ensureStyles(ctx.document); const box = ctx.document.createElement('div'); box.className = 'sr-glow-box'; ctx.document.body.appendChild(box);
    if (action.sequence) for (const el of elements) { placeBox(box, el); await ctx.moveCursor?.(el); await sleep(action.stepMs || 1100, ctx.signal); }
    else { placeBox(box, elements[0]); await ctx.moveCursor?.(elements[0]); await sleep(action.holdMs || 1600, ctx.signal); }
    if (action.keep) setTimeout(() => box.remove(), action.keepMs || 4000); else box.remove(); return true;
  }
  async function animateLever(el, target, durMs, ctx) {
    const from = Number(el.value) || 0; const min = Number(el.min) || 0; const max = Number(el.max) || 100; const to = target === 'max' ? max : target === 'min' ? min : Number(target);
    if (!Number.isFinite(to)) return; const started = performance.now(); let lastDispatch = 0; await ctx.moveCursor?.(el);
    await new Promise((resolve) => { const frame = (now) => { if (ctx.signal?.aborted) return resolve(); const p = Math.min(1, (now - started) / (Number(durMs) || 1200)); const eased = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; el.value = from + (to - from) * eased; if (p >= 1 || now - lastDispatch > 90) { el.dispatchEvent(new ctx.window.Event('input', { bubbles: true })); lastDispatch = now; } if (p < 1) ctx.window.requestAnimationFrame(frame); else { el.dispatchEvent(new ctx.window.Event('change', { bubbles: true })); resolve(); } }; ctx.window.requestAnimationFrame(frame); });
  }
  async function runDrag(action, ctx, el) {
    const destination = resolveElement(ctx.document, action, action.toSelector); const sourceRect = el.getBoundingClientRect(); const targetRect = destination?.getBoundingClientRect();
    const sx = sourceRect.left + (action.offsetX ?? sourceRect.width / 2); const sy = sourceRect.top + (action.offsetY ?? Math.min(18, sourceRect.height / 2)); const dx = targetRect ? targetRect.left + targetRect.width / 2 - sx : Number(action.dx) || 0; const dy = targetRect ? targetRect.top + targetRect.height / 2 - sy : Number(action.dy) || 0;
    const Pointer = ctx.window.PointerEvent || ctx.window.MouseEvent; const Mouse = ctx.window.MouseEvent; const event = (type, Ctor, x, y, pressed) => new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: ctx.window, clientX: x, clientY: y, button: 0, buttons: pressed ? 1 : 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' });
    await ctx.moveCursor?.(el); el.dispatchEvent(event('pointerdown', Pointer, sx, sy, true)); el.dispatchEvent(event('mousedown', Mouse, sx, sy, true)); const started = performance.now(); const duration = Number(action.durMs) || 900;
    await new Promise((resolve) => { const frame = (now) => { const p = Math.min(1, (now - started) / duration); const x = sx + dx * p; const y = sy + dy * p; ctx.window.dispatchEvent(event('pointermove', Pointer, x, y, true)); ctx.window.dispatchEvent(event('mousemove', Mouse, x, y, true)); ctx.window.__screenreelCursor?.moveToPoint?.(x, y, 1); if (!ctx.signal?.aborted && p < 1) ctx.window.requestAnimationFrame(frame); else { ctx.window.dispatchEvent(event('pointerup', Pointer, x, y, false)); ctx.window.dispatchEvent(event('mouseup', Mouse, x, y, false)); resolve(); } }; ctx.window.requestAnimationFrame(frame); });
  }
  async function runAction(source, context = {}) {
    const action = { ...source, type: actionType(source) }; const doc = context.document || root.document; const win = context.window || doc?.defaultView || root; const ctx = { ...context, document: doc, window: win, warn: context.warn || ((message) => console.warn('[screenreel]', message)) };
    if (!doc) return { ok: false, error: 'document' };
    if (action.type === 'wait') { await sleep(action.ms || 500, ctx.signal); return { ok: true }; }
    if (action.type === 'waitFor') { const found = await waitFor(doc, action.selector, action.condition || 'visible', action.timeoutMs || 8000, ctx.signal); if (!found) return { ok: false, error: 'timeout' }; if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true }; }
    if (action.type === 'highlight' || action.type === 'glow') { const ok = await runGlow(action, ctx); if (!ok) ctx.warn(`Selector not found: ${action.selector}`); if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok }; }
    if (action.type === 'goto') { await ctx.navigate?.(action.url); return { ok: true, navigated: true }; }
    if (action.type === 'call') { if (!/^[A-Za-z_$][\w$]*$/.test(action.fn || '')) return { ok: false, error: 'function' }; if (action.cursorTo) { const target = await waitFor(doc, action.cursorTo, 'appear', 6000, ctx.signal); if (target && target !== true) await ctx.moveCursor?.(target); } const fn = win[action.fn]; if (typeof fn !== 'function') return { ok: false, error: 'function' }; fn(...(Array.isArray(action.args) ? action.args : [])); if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true }; }
    let el = action.selector ? resolveElement(doc, action) : null; if (action.selector && !el) el = await waitFor(doc, action.selector, 'appear', action.timeoutMs || 8000, ctx.signal); if (action.selector && (!el || el === true)) { ctx.warn(`Selector not found: ${action.selector}`); return { ok: false, error: 'selector' }; }
    if (action.type === 'spotlight') { ensureStyles(doc); const box = doc.createElement('div'); box.className = 'sr-action-box'; placeBox(box, el); box.style.boxShadow = `0 0 0 2px rgba(255,255,255,.85),0 0 0 9999px rgba(9,9,11,${Number(action.dim) || .62})`; doc.body.appendChild(box); await ctx.moveCursor?.(el); await sleep(action.holdMs || 1800, ctx.signal); box.remove(); }
    else if (action.type === 'callout') { ensureStyles(doc); const tip = doc.createElement('div'); tip.className = 'sr-action-callout'; tip.textContent = action.text || 'Callout'; doc.body.appendChild(tip); const rect = el.getBoundingClientRect(); const left = action.placement === 'right' ? rect.right + 8 : action.placement === 'left' ? Math.max(8, rect.left - 288) : Math.max(8, Math.min(rect.left, win.innerWidth - 288)); const top = action.placement === 'top' ? rect.top - 48 : rect.bottom + 8; Object.assign(tip.style, { left: `${left}px`, top: `${Math.max(8, top)}px` }); await sleep(action.holdMs || 2200, ctx.signal); tip.remove(); }
    else if (action.type === 'click') { await ctx.moveCursor?.(el); ripple(doc, el); el.click(); }
    else if (action.type === 'hover') { await ctx.moveCursor?.(el); ['pointerover', 'mouseover', 'mouseenter'].forEach((type) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: type !== 'mouseenter', view: win }))); await sleep(action.holdMs || 800, ctx.signal); }
    else if (action.type === 'focus') { await ctx.moveCursor?.(el); el.focus({ preventScroll: false }); }
    else if (action.type === 'type') { await ctx.moveCursor?.(el); el.focus(); if (action.clearFirst !== false) dispatchValue(el, ''); let value = action.clearFirst === false ? String(el.value || '') : ''; for (const char of String(action.text ?? action.value ?? '')) { value += char; el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(action.charMs ?? 45, ctx.signal); } el.dispatchEvent(new win.Event('change', { bubbles: true })); }
    else if (action.type === 'set') dispatchValue(el, action.value ?? '');
    else if (action.type === 'toggle') { if (!!el.checked !== !!action.checked) el.click(); }
    else if (action.type === 'lever') await animateLever(el, action.to, action.durMs, ctx);
    else if (action.type === 'drag') await runDrag(action, ctx, el);
    else if (action.type === 'pointer') { await ctx.moveCursor?.(el); ripple(doc, el); const rect = el.getBoundingClientRect(); const Pointer = win.PointerEvent || win.MouseEvent; const opts = { bubbles: true, cancelable: true, composed: true, view: win, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' }; el.dispatchEvent(new Pointer('pointerdown', { ...opts, buttons: 1 })); el.dispatchEvent(new Pointer('pointerup', opts)); }
    else if (action.type === 'scrollIntoView') { el.scrollIntoView({ behavior: 'smooth', block: action.block || 'center' }); await sleep(action.durMs || 700, ctx.signal); }
    else if (action.type === 'scroll') { const box = el || doc.scrollingElement; let top = box.scrollTop; let left = box.scrollLeft; if (action.mode === 'relative') { const direction = ['up', 'left'].includes(action.direction) ? -1 : 1; const horizontal = ['left', 'right'].includes(action.direction); const basis = action.unit === 'pixels' ? 1 : action.unit === 'pagePercent' ? (horizontal ? box.scrollWidth : box.scrollHeight) / 100 : (horizontal ? win.innerWidth : win.innerHeight) / 100; if (horizontal) left += direction * Number(action.amount || 0) * basis; else top += direction * Number(action.amount || 0) * basis; } else if (action.mode === 'edge') { if (action.edge === 'bottom') top = box.scrollHeight; else if (action.edge === 'right') left = box.scrollWidth; else if (action.edge === 'left') left = 0; else top = 0; } else { top = action.top ?? top; left = action.left ?? left; } box.scrollTo({ top, left, behavior: 'smooth' }); await sleep(action.durMs || 800, ctx.signal); }
    else return { ok: false, error: 'unsupported' };
    if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true };
  }
  function validate(action, doc, baseHref) {
    const errors = []; const definition = definitionForAction(action); if (!definition) return ['Unsupported action type'];
    if (definition.picker !== 'none' && !action.selector) errors.push('Choose a target');
    if (definition.picker === 'source-destination' && !action.toSelector && action.dx == null && action.dy == null) errors.push('Choose a destination or provide a drag distance');
    if (actionType(action) === 'goto' && !normalizeRoute(action.url, baseHref)) errors.push('Use a valid local route');
    if (actionType(action) === 'call' && !/^[A-Za-z_$][\w$]*$/.test(action.fn || '')) errors.push('Use a valid function name');
    for (const key of ['selector', 'toSelector', 'cursorTo']) { if (!action[key] || !doc) continue; const count = queryAll(doc, action[key]).length; const collection = key === 'selector' && definition.picker === 'collection'; if (!count) errors.push(`${key} has no matches`); else if (!collection && count > 1 && action.index == null) errors.push(`${key} matches multiple elements`); }
    for (const spec of [...(definition.fields || []), { key: 'afterMs', min: 0, max: 30000 }]) if (spec.type === 'number' && action[spec.key] != null && action[spec.key] !== '') { const value = Number(action[spec.key]); if (!Number.isFinite(value) || (spec.min != null && value < spec.min) || (spec.max != null && value > spec.max)) errors.push(`${spec.label || spec.key} is outside the allowed range`); }
    return errors;
  }
  const interactiveSelector = 'button,a[href],input,select,textarea,[role="button"],[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  function isBroad(el, doc) { if (!el || ['BODY', 'HTML', 'MAIN'].includes(el.tagName) || el.getAttribute('role') === 'tabpanel' || el.hasAttribute('data-panel')) return true; const rect = el.getBoundingClientRect(); return rect.width * rect.height > doc.defaultView.innerWidth * doc.defaultView.innerHeight * .7; }
  function visualCandidate(el, doc) { if (!el || isBroad(el, doc)) return false; const rect = el.getBoundingClientRect(); if (rect.width < 24 || rect.height < 18) return false; const style = doc.defaultView.getComputedStyle(el); const padded = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((key) => parseFloat(style[key]) >= 6); return style.borderStyle !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(style.borderRadius) >= 4 || padded; }
  function resolvePickerTarget(exact, policy, doc = exact?.ownerDocument) { if (!exact || !doc) return null; if (policy === 'interactive') return exact.closest(interactiveSelector) || exact; if (policy === 'visual' || policy === 'collection') for (let el = exact; el && el !== doc.body; el = el.parentElement) if (visualCandidate(el, doc)) return el; return isBroad(exact, doc) ? null : exact; }
  const escapeCss = (value) => root.CSS?.escape ? root.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  function selectorFor(el) {
    const doc = el?.ownerDocument; if (!doc || !el) return null; const unique = (selector) => queryAll(doc, selector).length === 1;
    const demoId = el.getAttribute('data-demo-id'); if (demoId) return `[data-demo-id="${String(demoId).replace(/"/g, '\\"')}"]`;
    if (el.id && unique(`#${escapeCss(el.id)}`)) return `#${escapeCss(el.id)}`;
    for (const attr of [...el.attributes].filter((item) => item.name.startsWith('data-') && !item.name.startsWith('data-screenreel'))) { const selector = `[${attr.name}="${String(attr.value).replace(/"/g, '\\"')}"]`; if (attr.value && unique(selector)) return selector; }
    const parts = []; let node = el; while (node && node !== doc.body && parts.length < 5) { let part = node.tagName.toLowerCase(); const classes = [...node.classList].filter((name) => !name.startsWith('sr-') && !name.startsWith('screenreel-')).slice(0, 2); if (classes.length) part += classes.map((name) => `.${escapeCss(name)}`).join(''); const siblings = node.parentElement ? [...node.parentElement.children].filter((item) => item.tagName === node.tagName) : []; if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`; parts.unshift(part); const selector = parts.join(' > '); if (unique(selector)) return selector; node = node.parentElement; } return parts.join(' > ') || null;
  }
  function selectorForCollection(el) {
    const doc = el?.ownerDocument; if (!doc || !el) return null;
    for (const attr of [...el.attributes].filter((item) => item.name.startsWith('data-') && !item.name.startsWith('data-screenreel'))) {
      const selector = `[${attr.name}]`; if (queryAll(doc, selector).length > 1) return selector;
    }
    for (const name of [...el.classList].filter((item) => !item.startsWith('sr-') && !item.startsWith('screenreel-'))) {
      const selector = `.${escapeCss(name)}`; if (queryAll(doc, selector).length > 1) return selector;
    }
    return selectorFor(el);
  }
  function inspectDocument(doc) { return [...doc.querySelectorAll(`${interactiveSelector},[data-demo-id],[data-action]`)].slice(0, 500).map((el) => ({ selector: selectorFor(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', text: String(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 120), interactive: !!el.closest(interactiveSelector) })).filter((item) => item.selector); }

  root.ScreenReelCore = { definitions, recipes, supportedTypes, aliases, actionType, getDefinition: (id) => byId.get(id) || null, definitionForAction, normalizeRoute, runAction, validate, sleep, waitFor, resolvePickerTarget, selectorFor, selectorForCollection, inspectDocument };
})(globalThis);
