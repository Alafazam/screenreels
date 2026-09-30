/* ScreenReel shared action registry, selector tooling, validation, and executor. */
(function initScreenReelCore(root) {
  if (root.ScreenReelCore) return;

  const field = (key, label, type = 'number', extra = {}) => ({ key, label, type, ...extra });
  const definitions = [
    { id: 'highlight', type: 'highlight', category: 'Emphasis', label: 'Highlight target', picker: 'visual', defaults: { holdMs: 1600 }, fields: [field('holdMs', 'Highlight time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'highlight-sequence', type: 'glow', category: 'Emphasis', label: 'Highlight target sequence', picker: 'collection', defaults: { sequence: true, count: 6, stepMs: 1050, afterMs: 400 }, fields: [field('count', 'Maximum targets', 'number', { min: 1, max: 30 }), field('stepMs', 'Time per target (ms)', 'number', { min: 100, max: 10000 })] },
    { id: 'spotlight', type: 'spotlight', category: 'Emphasis', label: 'Spotlight target', picker: 'visual', defaults: { holdMs: 1800, dim: 0.62 }, fields: [field('holdMs', 'Spotlight time (ms)', 'number', { min: 100, max: 30000 }), field('dim', 'Background dimming', 'number', { min: 0.1, max: 0.9, step: 0.05 })] },
    { id: 'callout', type: 'callout', category: 'Emphasis', label: 'Target callout', picker: 'visual', defaults: { text: 'Add your callout', placement: 'auto', holdMs: 2200 }, fields: [field('title', 'Callout title (optional)', 'text'), field('text', 'Callout text', 'textarea'), field('highlight', 'Highlight the target too', 'checkbox'), field('placement', 'Placement', 'select', { options: ['auto', 'top', 'right', 'bottom', 'left'] }), field('holdMs', 'Callout time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'flash', type: 'flash', category: 'Emphasis', label: 'Flash target', picker: 'visual', defaults: { times: 2 }, fields: [field('times', 'Flash count', 'number', { min: 1, max: 10 })] },
    { id: 'reel', type: 'reel', category: 'Emphasis', label: 'Reel text into place', picker: 'visual', defaults: { frames: 7, stepMs: 80, holdMs: 500 }, fields: [field('frames', 'Spin frames', 'number', { min: 2, max: 30 }), field('stepMs', 'Time per frame (ms)', 'number', { min: 20, max: 500 }), field('holdMs', 'Hold after landing (ms)', 'number', { min: 0, max: 10000 })] },
    { id: 'reveal', type: 'reveal', category: 'Emphasis', label: 'Reveal image over target', picker: 'visual', defaults: { holdMs: 1600 }, fields: [field('src', 'Image URL', 'text'), field('holdMs', 'Hold time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'snippet', type: 'snippet', category: 'Emphasis', label: 'Show code beside target', picker: 'visual', defaults: { label: 'How it works', code: '{ "type": "highlight" }', side: 'auto', holdMs: 2600 }, fields: [field('label', 'Panel label', 'text'), field('code', 'Code to show', 'textarea'), field('side', 'Side', 'select', { options: ['auto', 'left', 'right'] }), field('holdMs', 'Hold time (ms)', 'number', { min: 100, max: 30000 })] },
    { id: 'countdown', type: 'countdown', category: 'Timing', label: 'Play countdown', picker: 'none', defaults: { from: 3, stepMs: 720, caption: 'Your demo is about to play' }, fields: [field('from', 'Start number', 'number', { min: 1, max: 9 }), field('caption', 'Caption', 'text'), field('stepMs', 'Time per number (ms)', 'number', { min: 200, max: 3000 })] },
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
    { id: 'choice', type: 'choice', category: 'Navigation', label: 'Viewer choice', picker: 'none', defaults: { prompt: 'What do you want to see next?', options: [], timeoutMs: 0, defaultScene: '' }, fields: [field('prompt', 'Prompt', 'text'), field('options', 'Options (JSON array of {label, scene})', 'json'), field('timeoutMs', 'Auto-continue after (ms, 0 = wait)', 'number', { min: 0, max: 120000 }), field('defaultScene', 'Default scene on timeout / capture', 'text')] },
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
  /* The definitions table is the one home for an action's defaults; the executor falls back to it
     rather than repeating the numbers. Keyed by definition id: DEFAULTS.spotlight.holdMs. */
  const DEFAULTS = Object.fromEntries(definitions.map((item) => [item.id, item.defaults]));
  /* Executor fallbacks that deliberately differ from the definitions table. Studio seeds new
     actions from the table; these apply only to hand-written manifests that omit the field, and
     changing them would change how existing flows play. */
  const GLOW_FALLBACK_COUNT = 12, GLOW_FALLBACK_STEP_MS = 1100;
  const WAIT_FALLBACK_MS = 500;
  const KEEP_FALLBACK_MS = 4000;       // how long a `keep` highlight ring lingers after its action
  /* Element readiness. */
  const ELEMENT_WAIT_TIMEOUT_MS = 8000, CURSOR_TARGET_WAIT_MS = 6000, WAIT_POLL_MS = 120;
  /* Geometry. */
  const BOX_PADDING_PX = 5;            // highlight ring and dim cut-out sit this far outside the target
  const REVEAL_MARGIN_PX = 24, REVEAL_MIN_WIDTH_PX = 640, REVEAL_ASPECT = 10 / 16;
  const DRAG_GRAB_MAX_OFFSET_Y_PX = 18; // grab near the top of a tall card, where its handle usually is
  const RIPPLE_REMOVE_MS = 700;        // outlives the .65s sr-ripple animation
  const LEVER_INPUT_THROTTLE_MS = 90;  // input events while a slider moves, so listeners are not flooded
  const REEL_SCRAMBLE_INDEX_STRIDE = 3, REEL_SCRAMBLE_FRAME_STRIDE = 7; // deterministic glyph scramble
  const AFTER_MS_MAX = 30000;
  const CALLOUT_GAP_PX = 8;            // space between a callout and its target
  const CALLOUT_VIEWPORT_MARGIN_PX = 8; // a callout never comes closer than this to the viewport edge
  /* The side a callout tries first for `placement: 'auto'`, then the rest in order. */
  const CALLOUT_AUTO_ORDER = ['bottom', 'top', 'right', 'left'];
  const OPPOSITE_SIDE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  /* Selector tooling: what counts as a visual target, and how deep a generated selector may go. */
  const BROAD_TARGET_VIEWPORT_SHARE = 0.7;
  const VISUAL_MIN_WIDTH_PX = 24, VISUAL_MIN_HEIGHT_PX = 18, VISUAL_MIN_PADDING_PX = 6, VISUAL_MIN_RADIUS_PX = 4;
  const SELECTOR_MAX_DEPTH = 5, SELECTOR_MAX_CLASSES = 2;
  const aliases = { fill: 'type' };
  const supportedTypes = new Set(definitions.map((item) => item.type).concat(['fill', 'glow']));
  /* One authoritative pacing multiplier. Every deliberate delay in the runtime goes through
     sleep(), so scaling here covers manifest values, definition defaults, and the internal
     constants alike — which a manifest-rewriting scaler cannot reach. Timeouts and scroll
     settle limits are deliberately left unscaled: those are limits, not pacing. */
  const DEFAULT_TIME_SCALE = 1;
  let timeScale = DEFAULT_TIME_SCALE;
  function setTimeScale(value) {
    const next = Number(value);
    timeScale = Number.isFinite(next) && next > 0 ? next : DEFAULT_TIME_SCALE;
    return timeScale;
  }
  const scaled = (ms) => Math.round(Math.max(0, Number(ms) || 0) * timeScale);
  const sleep = (ms, signal) => new Promise((resolve) => {
    const timer = setTimeout(resolve, scaled(ms));
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
      // srv_* are ScreenReel share-link variables, not app routing state — a personalized link
      // must still route-match the scene it personalizes.
      for (const key of [...url.searchParams.keys()]) if (key.startsWith('srv_')) url.searchParams.delete(key);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch { return null; }
  }
  function queryAll(doc, selector) { try { return selector ? [...doc.querySelectorAll(selector)] : []; } catch { return []; } }
  function resolveElement(doc, action, selector = action.selector) { return queryAll(doc, selector)[Number(action.index) || 0] || null; }
  async function waitFor(doc, selector, condition = 'appear', timeoutMs = ELEMENT_WAIT_TIMEOUT_MS, signal) {
    const started = Date.now();
    while (!signal?.aborted && Date.now() - started <= timeoutMs) {
      const el = selector ? resolveElement(doc, { selector }) : doc.body; const style = el ? doc.defaultView.getComputedStyle(el) : null;
      const visible = !!el && style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
      const met = condition === 'disappear' ? !el : condition === 'visible' ? visible : condition === 'enabled' ? visible && !el.disabled : condition === 'selected' ? !!el && (el.checked || el.selected || el.getAttribute('aria-selected') === 'true') : !!el;
      if (met) return el || true; await sleep(WAIT_POLL_MS, signal);
    }
    return null;
  }
  function ensureStyles(doc) {
    if (doc.getElementById('__screenreelActionStyles')) return;
    const style = doc.createElement('style'); style.id = '__screenreelActionStyles';
    style.textContent = '@property --sr-angle{syntax:"<angle>";initial-value:0deg;inherits:false}.sr-action-box,.sr-glow-box{position:fixed;z-index:2147483000;pointer-events:none;border-radius:var(--sr-ring-radius,14px);border:3px solid var(--sr-ring-color,var(--sr-accent,#7c3aed));box-shadow:var(--sr-ring-shadow,0 0 0 2px rgba(255,255,255,.86),0 0 24px rgba(124,58,237,.48));transition:all .32s ease}.sr-dim-backdrop{position:fixed;z-index:2147481999;pointer-events:none;border-radius:14px;transition:all .32s ease;animation:sr-dim-in .24s ease both}@keyframes sr-dim-in{from{opacity:0}}.sr-glow-box{border-color:transparent;background:var(--sr-glow,conic-gradient(from var(--sr-angle),#ff5e5e,#ffb84d,#ffe74d,#6ef08c,#4dc9ff,#7c6ef0,#d05ef0,#ff5ec8,#ff5e5e)) border-box;-webkit-mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);mask-composite:exclude;animation:sr-spin 2s linear infinite}@keyframes sr-spin{to{--sr-angle:360deg}}.sr-action-callout{position:fixed;z-index:2147483647;box-sizing:border-box;max-width:var(--sr-callout-width,300px);padding:12px 14px;border:var(--sr-callout-border,1px solid #e4e4e7);border-radius:var(--sr-callout-radius,10px);background:var(--sr-callout-bg,#fff);color:var(--sr-callout-fg,#18181b);font:500 var(--sr-callout-font-size,13px)/1.45 var(--sr-font-family,system-ui,sans-serif);box-shadow:var(--sr-callout-shadow,0 12px 32px rgba(15,23,42,.16));pointer-events:none}.sr-action-callout.sr-callout--interactive{pointer-events:auto}.sr-callout-title{margin:0 0 3px;font-weight:600;font-size:var(--sr-callout-title-size,14px);color:var(--sr-callout-title-fg,inherit)}.sr-callout-body{color:var(--sr-callout-body-fg,#52525b)}.sr-callout-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:12px}.sr-callout-actions button{padding:5px 12px;border:1px solid var(--sr-callout-button-border,#e4e4e7);border-radius:var(--sr-button-radius,7px);background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}.sr-callout-actions .sr-callout-next{border-color:var(--sr-accent,#7c3aed);background:var(--sr-accent,#7c3aed);color:var(--sr-accent-foreground,#fff)}.sr-callout-actions button:focus-visible{outline:2px solid var(--sr-accent,#7c3aed);outline-offset:2px}.sr-callout-step{margin-right:auto;align-self:center;color:var(--sr-callout-muted,#71717a);font-weight:500}.sr-callout-actions .sr-callout-skip{border-color:transparent;color:var(--sr-callout-muted,#71717a)}.sr-click-ripple{position:fixed;z-index:2147483100;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:var(--sr-ripple-color,var(--sr-accent,#7c3aed));pointer-events:none;animation:sr-ripple .65s ease-out forwards}@keyframes sr-ripple{to{opacity:0;transform:scale(3.2)}}.sr-flash-on{background:rgba(124,58,237,.16);box-shadow:0 0 0 4px rgba(124,58,237,.28);border-radius:6px;transition:background .16s ease,box-shadow .16s ease}.sr-reel,.sr-reel-landed{display:inline-block;font-variant-numeric:tabular-nums}.sr-reel-landed{animation:sr-reel-pop .5s ease}@keyframes sr-reel-pop{0%{transform:scale(1)}32%{transform:scale(1.18)}100%{transform:scale(1)}}.sr-reveal{position:fixed;z-index:2147483050;object-fit:contain;background:#fff;border:1px solid rgba(9,9,11,.08);border-radius:14px;box-shadow:0 30px 80px rgba(9,9,11,.4);opacity:0;transform:scale(.94);transition:opacity .3s ease,transform .3s ease;pointer-events:none}.sr-reveal.show{opacity:1;transform:scale(1)}.sr-countdown-overlay{position:fixed;inset:0;z-index:2147483200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none;background:var(--sr-countdown-backdrop,transparent);backdrop-filter:var(--sr-countdown-backdrop-filter,none)}.sr-count-num{font:800 var(--sr-countdown-size,220px)/1 var(--sr-font-family,system-ui,sans-serif);letter-spacing:-.04em;color:var(--sr-countdown-color,rgba(63,63,70,.24));text-shadow:0 2px 34px rgba(255,255,255,.65)}.sr-count-num.pop{animation:sr-count-pop .72s ease both}.sr-count-cap{font:600 16px/1.3 var(--sr-font-family,system-ui,sans-serif);color:var(--sr-countdown-caption-color,rgba(63,63,70,.5))}@keyframes sr-count-pop{0%{transform:scale(.72);opacity:0}25%{opacity:1}45%{transform:scale(1);opacity:1}100%{transform:scale(1.16);opacity:0}}.sr-snippet{position:fixed;z-index:2147483060;width:340px;max-width:calc(100vw - 32px);padding:14px 15px;border-radius:14px;background:#fff;border:1px solid rgba(9,9,11,.1);box-shadow:0 18px 48px rgba(9,9,11,.18);opacity:0;transform:translateY(8px);transition:opacity .26s ease,transform .26s ease;pointer-events:none}.sr-snippet.show{opacity:1;transform:translateY(0)}.sr-snippet-label{margin:0 0 9px;font:700 12px/1.3 system-ui,sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#7c3aed}.sr-snippet-code{margin:0;background:#fafafa;border:1px solid rgba(9,9,11,.08);border-radius:9px;padding:11px;font:500 11.5px/1.55 ui-monospace,Menlo,monospace;color:#3f3f46;white-space:pre;overflow:auto;max-height:220px}.sr-choice-overlay{position:fixed;inset:0;z-index:2147483200;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--sr-choice-backdrop,rgba(9,9,11,.52));pointer-events:auto;opacity:0;transition:opacity .24s ease}.sr-choice-overlay.show{opacity:1}.sr-choice-prompt{font:700 24px/1.3 var(--sr-font-family,system-ui,sans-serif);color:var(--sr-choice-prompt-color,#fff);text-shadow:0 2px 14px rgba(9,9,11,.5);max-width:640px;text-align:center;padding:0 20px}.sr-choice-cards{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;padding:0 20px}.sr-choice-card{min-width:180px;max-width:280px;padding:18px 22px;border-radius:var(--sr-choice-radius,14px);border:1px solid rgba(255,255,255,.16);background:var(--sr-choice-card-bg,#fff);color:var(--sr-choice-card-fg,#18181b);font:700 15px/1.35 var(--sr-font-family,system-ui,sans-serif);cursor:pointer;box-shadow:0 18px 48px rgba(9,9,11,.35);transition:transform .16s ease,box-shadow .16s ease}.sr-choice-card:hover,.sr-choice-card.picked{transform:translateY(-3px);box-shadow:0 24px 56px rgba(9,9,11,.45);outline:3px solid var(--sr-accent,#7c3aed)}';
    doc.head.prepend(style); // first in <head>, so a host's own rules win at equal specificity
  }
  /* Everything ScreenReel draws goes into one layer. The Projector makes it a top-layer popover so
     host dialogs and CDK overlays (which live in the browser's top layer, above every z-index)
     cannot cover the tour; without a Projector (Capture, a bare runtime) overlays go into <body>. */
  const LAYER_ID = '__screenreelLayer';
  function overlayParent(doc) { return doc.getElementById?.(LAYER_ID) || doc.body; }
  function placeBox(box, el) { const rect = el.getBoundingClientRect(); Object.assign(box.style, { left: `${rect.left - BOX_PADDING_PX}px`, top: `${rect.top - BOX_PADDING_PX}px`, width: `${rect.width + BOX_PADDING_PX * 2}px`, height: `${rect.height + BOX_PADDING_PX * 2}px` }); }
  /* Highlight, highlight sequence, and callout dim the rest of the page so the eye lands on the
     target. Precedence: the action's own `dim`, then the host's context default (Projector's
     `dim` mount option), then DEFAULT_EMPHASIS_DIM. `0` or `false` turns it off. Lighter than
     spotlight's 0.62 on purpose — spotlight is the "everything else goes away" action. */
  const DEFAULT_EMPHASIS_DIM = 0.45, MAX_DIM = 0.9;
  function dimLevel(action, ctx) {
    const value = action.dim ?? ctx.dim ?? DEFAULT_EMPHASIS_DIM;
    if (value === false) return 0;
    const level = Number(value);
    if (!Number.isFinite(level) || level < 0) { ctx.warn(`Invalid dim value: ${value}`); return DEFAULT_EMPHASIS_DIM; }
    return Math.min(level, MAX_DIM);
  }
  /* A cut-out: a transparent box over the target whose giant spread shadow darkens everything
     else. Placed before insertion so the hole never animates in from the corner. */
  function createDimBackdrop(doc, el, level) {
    const node = doc.createElement('div'); node.className = 'sr-dim-backdrop';
    node.style.boxShadow = `0 0 0 9999px rgba(var(--sr-dim-rgb, 9, 9, 11), ${level})`; placeBox(node, el); overlayParent(doc).appendChild(node); return node;
  }
  function createRing(doc, el) {
    const ring = doc.createElement('div'); ring.className = 'sr-glow-box'; placeBox(ring, el); overlayParent(doc).appendChild(ring); return ring;
  }
  /* Where a callout goes. Pure geometry so it can be tested without a browser.
     - `left`/`right` centre vertically on the target; `top`/`bottom` align to its left edge.
     - A requested side without room flips to the opposite side; if neither fits (a full-height
       sidebar, say), the side with the most room wins.
     - The result is clamped inside the viewport on both axes, whatever the target does.
     Returns { left, top, side }, where side is where the callout actually landed. */
  function placeCallout(target, size, viewport, placement = 'auto') {
    const room = {
      top: target.top - CALLOUT_GAP_PX - CALLOUT_VIEWPORT_MARGIN_PX,
      bottom: viewport.height - target.bottom - CALLOUT_GAP_PX - CALLOUT_VIEWPORT_MARGIN_PX,
      left: target.left - CALLOUT_GAP_PX - CALLOUT_VIEWPORT_MARGIN_PX,
      right: viewport.width - target.right - CALLOUT_GAP_PX - CALLOUT_VIEWPORT_MARGIN_PX,
    };
    const fits = (side) => room[side] >= (side === 'top' || side === 'bottom' ? size.height : size.width);
    const roomiest = () => Object.keys(room).reduce((best, side) => (room[side] > room[best] ? side : best));
    let side;
    if (OPPOSITE_SIDE[placement]) side = fits(placement) ? placement : fits(OPPOSITE_SIDE[placement]) ? OPPOSITE_SIDE[placement] : roomiest();
    else side = CALLOUT_AUTO_ORDER.find(fits) || roomiest();
    const centredTop = target.top + target.height / 2 - size.height / 2;
    const position = {
      top: { left: target.left, top: target.top - CALLOUT_GAP_PX - size.height },
      bottom: { left: target.left, top: target.bottom + CALLOUT_GAP_PX },
      left: { left: target.left - CALLOUT_GAP_PX - size.width, top: centredTop },
      right: { left: target.right + CALLOUT_GAP_PX, top: centredTop },
    }[side];
    const clamp = (value, extent, available) => Math.max(CALLOUT_VIEWPORT_MARGIN_PX, Math.min(value, available - CALLOUT_VIEWPORT_MARGIN_PX - extent));
    return { left: clamp(position.left, size.width, viewport.width), top: clamp(position.top, size.height, viewport.height), side };
  }
  /* The end of an emphasis action. Normally its overlays go as soon as its time is up. They stay
     up instead, handed to the host through ctx.retain(release), when the action asks to outlive
     itself (`keep: 'untilSceneEnd'`) or the host asks it to persist (a guided tour holding its
     final emphasis until Next). An interrupted action always cleans up at once. */
  /* Panels and late layout push targets around while an overlay is up, so overlays re-place
     themselves every frame until released. Returns stop(). A window without rAF (a test stub)
     simply does not follow. */
  function followTarget(win, place) {
    if (!win.requestAnimationFrame) return () => {};
    let frame = null; let stopped = false;
    const tick = () => { if (stopped) return; place(); frame = win.requestAnimationFrame(tick); };
    frame = win.requestAnimationFrame(tick);
    return () => { stopped = true; win.cancelAnimationFrame?.(frame); };
  }
  function settleOverlays(action, ctx, nodes, stopFollowing) {
    const release = () => { stopFollowing?.(); nodes.forEach((node) => node?.remove()); };
    const outlive = action.keep === 'untilSceneEnd' || ctx.persist === true;
    if (outlive && ctx.retain && !ctx.signal?.aborted) ctx.retain(release); else release();
  }
  function buildCallout(doc, action, controls) {
    const tip = doc.createElement('div'); tip.className = 'sr-action-callout';
    if (action.title) { const heading = doc.createElement('div'); heading.className = 'sr-callout-title'; heading.textContent = action.title; tip.appendChild(heading); }
    const body = doc.createElement('div'); body.className = 'sr-callout-body'; body.textContent = action.text || 'Callout'; tip.appendChild(body);
    /* Guided tours put the controls where the viewer is already looking. Labels come from the host. */
    if (controls) {
      tip.classList.add('sr-callout--interactive');
      const bar = doc.createElement('div'); bar.className = 'sr-callout-actions';
      if (controls.step) { const step = doc.createElement('span'); step.className = 'sr-callout-step'; step.textContent = controls.step; bar.appendChild(step); }
      for (const [key, handler] of [['skip', controls.onSkip], ['back', controls.onBack], ['next', controls.onNext]]) {
        if (!handler) continue;
        const button = doc.createElement('button'); button.type = 'button'; button.className = `sr-callout-${key}`; button.textContent = controls.labels[key];
        button.addEventListener('click', handler); bar.appendChild(button);
      }
      tip.appendChild(bar);
    }
    return tip;
  }
  async function runCallout(action, ctx, el) {
    const doc = ctx.document; const win = ctx.window; ensureStyles(doc);
    const level = dimLevel(action, ctx); const backdrop = level ? createDimBackdrop(doc, el, level) : null;
    const ring = action.highlight ? createRing(doc, el) : null;
    const controls = ctx.persist ? ctx.calloutControls : null;
    const tip = buildCallout(doc, action, controls); overlayParent(doc).appendChild(tip);
    const place = () => {
      if (backdrop) placeBox(backdrop, el); if (ring) placeBox(ring, el);
      const measured = tip.getBoundingClientRect();
      const { left, top, side } = placeCallout(el.getBoundingClientRect(), { width: measured.width, height: measured.height }, { width: win.innerWidth, height: win.innerHeight }, action.placement);
      Object.assign(tip.style, { left: `${left}px`, top: `${top}px` }); tip.dataset.side = side;
    };
    place(); const stopFollowing = followTarget(win, place);
    if (controls?.focusNext) tip.querySelector?.('.sr-callout-next')?.focus?.({ preventScroll: true });
    // A guided step waits for the viewer, not a timer: the host holds it until Next.
    if (!ctx.skipHold) await sleep(action.holdMs || DEFAULTS.callout.holdMs, ctx.signal);
    settleOverlays(action, ctx, [tip, ring, backdrop], stopFollowing);
  }
  const SCROLL_SETTLE_FRAMES = 3, SCROLL_SETTLE_MAX_MS = 1200, SCROLL_SETTLE_TICK_MS = 32;
  const FLASH_ON_MS = 190, FLASH_OFF_MS = 150;
  const REVEAL_FADE_IN_MS = 20, REVEAL_FADE_OUT_MS = 320;
  const REEL_LANDED_MS = 500;
  const SNIPPET_KEEP_MS = 6000, SNIPPET_MARGIN_PX = 20;
  const CHOICE_MIN_OPTIONS = 1, CHOICE_MAX_OPTIONS = 4, CHOICE_AUTOPICK_HOLD_MS = 900;
  function scrollOffset(box, win) {
    const doc = win.document; const scroller = doc?.scrollingElement || doc?.documentElement;
    if (box && box !== win && box !== scroller && box !== doc?.body) return { top: box.scrollTop, left: box.scrollLeft };
    return { top: win.scrollY ?? scroller?.scrollTop ?? 0, left: win.scrollX ?? scroller?.scrollLeft ?? 0 };
  }
  function waitForScrollEnd(ctx, box) {
    const win = ctx.window;
    /* rAF alone stalls in a throttled or non-compositing tab (background tabs get ~1 frame/s),
       so race it against a timer tick and let whichever fires first advance the check. */
    const raf = win.requestAnimationFrame
      ? (fn) => { let done = false; const once = () => { if (done) return; done = true; fn(); }; win.requestAnimationFrame(once); setTimeout(once, SCROLL_SETTLE_TICK_MS); }
      : (fn) => setTimeout(fn, SCROLL_SETTLE_TICK_MS);
    return new Promise((resolve) => {
      let last = scrollOffset(box, win); let stable = 0; const started = Date.now();
      /* Every scroll in the runtime settles through here, so driving the cursor bob from this
         one place covers scrollIntoView, container scroll, and the implicit ensureInView scroll. */
      let bobbing = false;
      const done = () => { if (bobbing) ctx.stopScrollCursor?.(); resolve(); };
      const tick = () => {
        if (ctx.signal?.aborted) return done();
        const now = scrollOffset(box, win);
        const delta = now.top - last.top;
        if (!bobbing && Math.abs(delta) >= 1) { bobbing = true; ctx.scrollCursor?.(delta > 0 ? 1 : -1); }
        stable = Math.abs(delta) < 1 && Math.abs(now.left - last.left) < 1 ? stable + 1 : 0;
        last = now;
        if (stable >= SCROLL_SETTLE_FRAMES || Date.now() - started > SCROLL_SETTLE_MAX_MS) return done();
        raf(tick);
      };
      raf(tick);
    });
  }
  /* "In view" means comfortably in view, not merely on screen: an element hugging the bottom edge
     sits under sticky footers and toolbars and leaves no room for its callout. */
  const VIEW_COMFORT_TOP = 0.1, VIEW_COMFORT_BOTTOM = 0.8; // fractions of the viewport height
  const tallerThanComfort = (rect, vh) => rect.height > vh * (VIEW_COMFORT_BOTTOM - VIEW_COMFORT_TOP);
  function isInView(el, win) {
    const rect = el.getBoundingClientRect(); const vh = win.innerHeight || 0; const vw = win.innerWidth || 0;
    const horizontal = rect.left >= 0 && rect.right <= vw;
    // A tall element can never fit the comfort band; its top being near the top of the view is enough.
    if (tallerThanComfort(rect, vh)) return horizontal && rect.top >= 0 && rect.top <= vh * VIEW_COMFORT_TOP * 2;
    return horizontal && rect.top >= vh * VIEW_COMFORT_TOP && rect.bottom <= vh * VIEW_COMFORT_BOTTOM;
  }
  async function ensureInView(el, ctx) {
    if (!el || el === true || isInView(el, ctx.window)) return;
    const block = tallerThanComfort(el.getBoundingClientRect(), ctx.window.innerHeight || 0) ? 'start' : 'center';
    el.scrollIntoView({ behavior: 'smooth', block, inline: 'center' });
    await waitForScrollEnd(ctx);
  }
  const REEL_GLYPHS = '#@$%&*0123456789ABCDEF';
  async function runFlash(action, ctx, el) {
    ensureStyles(ctx.document); const times = Math.max(1, Number(action.times) || 2);
    for (let i = 0; i < times; i++) { if (ctx.signal?.aborted) break; el.classList.add('sr-flash-on'); await sleep(action.onMs ?? FLASH_ON_MS, ctx.signal); el.classList.remove('sr-flash-on'); await sleep(action.offMs ?? FLASH_OFF_MS, ctx.signal); }
  }
  async function runReel(action, ctx, el) {
    const original = el.textContent; const frames = Math.max(2, Number(action.frames) || DEFAULTS.reel.frames); const stepMs = Number(action.stepMs) || DEFAULTS.reel.stepMs;
    el.classList.add('sr-reel');
    for (let f = 0; f < frames - 1; f++) { if (ctx.signal?.aborted) break; el.textContent = [...original].map((ch, idx) => ch === ' ' ? ' ' : REEL_GLYPHS[(idx * REEL_SCRAMBLE_INDEX_STRIDE + f * REEL_SCRAMBLE_FRAME_STRIDE + ch.charCodeAt(0)) % REEL_GLYPHS.length]).join(''); await sleep(stepMs, ctx.signal); }
    el.textContent = original; el.classList.remove('sr-reel'); el.classList.add('sr-reel-landed');
    await sleep(action.holdMs ?? REEL_LANDED_MS, ctx.signal); el.classList.remove('sr-reel-landed');
  }
  async function runReveal(action, ctx, el) {
    if (!action.src) { ctx.warn('reveal requires an image src'); return; }
    ensureStyles(ctx.document); const doc = ctx.document; const win = ctx.window; const rect = el.getBoundingClientRect(); const margin = REVEAL_MARGIN_PX;
    const width = Math.min(win.innerWidth - margin * 2, Math.max(rect.width, REVEAL_MIN_WIDTH_PX));
    const height = Math.min(win.innerHeight - margin * 2, Math.round(width * REVEAL_ASPECT));
    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, win.innerWidth - margin - width));
    const top = Math.max(margin, Math.min(rect.top + rect.height / 2 - height / 2, win.innerHeight - margin - height));
    const img = doc.createElement('img'); img.className = 'sr-reveal';
    try { img.src = new URL(action.src, win.location.href).href; } catch { img.src = action.src; }
    Object.assign(img.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    overlayParent(doc).appendChild(img); await sleep(REVEAL_FADE_IN_MS, ctx.signal); img.classList.add('show');
    await sleep(action.holdMs || DEFAULTS.reveal.holdMs, ctx.signal); img.classList.remove('show'); await sleep(REVEAL_FADE_OUT_MS, ctx.signal); img.remove();
  }
  /* Side panel holding the code a developer would write for the target being shown.
     Sits on whichever side of the target has more room, so it never covers the subject. */
  async function runSnippet(action, ctx, el) {
    ensureStyles(ctx.document); const doc = ctx.document; const win = ctx.window;
    const panel = doc.createElement('div'); panel.className = 'sr-snippet';
    if (action.label) { const label = doc.createElement('p'); label.className = 'sr-snippet-label'; label.textContent = action.label; panel.appendChild(label); }
    const code = doc.createElement('pre'); code.className = 'sr-snippet-code'; code.textContent = String(action.code ?? ''); panel.appendChild(code);
    overlayParent(doc).appendChild(panel);
    const rect = el.getBoundingClientRect(); const size = panel.getBoundingClientRect(); const margin = SNIPPET_MARGIN_PX;
    const roomLeft = rect.left - margin * 2, roomRight = win.innerWidth - rect.right - margin * 2;
    const side = action.side === 'left' || action.side === 'right' ? action.side
      : Math.max(roomLeft, roomRight) >= size.width ? (roomLeft > roomRight ? 'left' : 'right')
        : 'corner'; // Wide targets leave no gutter: dock the panel instead of covering the subject.
    if (side === 'corner') Object.assign(panel.style, { left: `${margin}px`, top: `${win.innerHeight - size.height - margin}px` });
    else {
      const left = side === 'left' ? rect.left - size.width - margin : rect.right + margin;
      const top = Math.max(margin, Math.min(rect.top + rect.height / 2 - size.height / 2, win.innerHeight - size.height - margin));
      Object.assign(panel.style, { left: `${Math.max(margin, left)}px`, top: `${top}px` });
    }
    await sleep(REVEAL_FADE_IN_MS, ctx.signal); panel.classList.add('show');
    /* keep: leave the panel up while later actions run, so code and emphasis are on screen together. */
    if (action.keep) { setTimeout(() => panel.remove(), scaled(action.keepMs || SNIPPET_KEEP_MS)); return; }
    await sleep(action.holdMs || DEFAULTS.snippet.holdMs, ctx.signal); panel.classList.remove('show'); await sleep(REVEAL_FADE_OUT_MS, ctx.signal); panel.remove();
  }
  /* Viewer-facing choice cards. Unlike every other overlay these accept pointer events —
     the viewer clicks a card and playback jumps to its scene (via the jumpTo result channel).
     Deterministic contexts (capture) pass ctx.chooseOption to auto-pick; a pause/disable abort
     removes the overlay and continues linearly, which is not an error. */
  function runChoice(action, ctx) {
    ensureStyles(ctx.document); const doc = ctx.document;
    const options = (Array.isArray(action.options) ? action.options : []).slice(0, CHOICE_MAX_OPTIONS)
      .map((option) => ({ label: String(option?.label ?? ''), scene: String(option?.scene ?? '') }))
      .filter((option) => option.label && option.scene);
    if (options.length < CHOICE_MIN_OPTIONS) { ctx.warn('choice needs at least one { label, scene } option'); return Promise.resolve({ ok: false, error: 'options' }); }
    const overlay = doc.createElement('div'); overlay.className = 'sr-choice-overlay';
    const prompt = doc.createElement('div'); prompt.className = 'sr-choice-prompt'; prompt.textContent = action.prompt || 'What do you want to see next?';
    const cards = doc.createElement('div'); cards.className = 'sr-choice-cards';
    overlay.appendChild(prompt); overlay.appendChild(cards);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => { if (settled) return; settled = true; ctx.signal?.removeEventListener('abort', onAbort); overlay.remove(); resolve(result); };
      const onAbort = () => finish({ ok: true });
      const buttons = options.map((option) => {
        const button = doc.createElement('button'); button.type = 'button'; button.className = 'sr-choice-card'; button.textContent = option.label;
        button.addEventListener('click', () => finish({ ok: true, jumpTo: option.scene }));
        cards.appendChild(button); return { button, option };
      });
      overlayParent(doc).appendChild(overlay);
      const raf = ctx.window?.requestAnimationFrame;
      raf ? raf(() => overlay.classList.add('show')) : overlay.classList.add('show');
      ctx.signal?.addEventListener('abort', onAbort, { once: true });
      if (ctx.chooseOption) {
        // Capture/deterministic path: show the cards, visually pick one, continue.
        const scene = String(ctx.chooseOption(action) || options[0].scene);
        const picked = buttons.find(({ option }) => option.scene === scene) || buttons[0];
        picked.button.classList.add('picked');
        sleep(CHOICE_AUTOPICK_HOLD_MS, ctx.signal).then(() => finish({ ok: true, jumpTo: picked.option.scene }));
      } else if (Number(action.timeoutMs) > 0) {
        sleep(action.timeoutMs, ctx.signal).then(() => finish(action.defaultScene ? { ok: true, jumpTo: String(action.defaultScene) } : { ok: true }));
      }
    });
  }
  async function runCountdown(action, ctx) {
    ensureStyles(ctx.document); const doc = ctx.document; const from = Math.max(1, Number(action.from) || DEFAULTS.countdown.from);
    const overlay = doc.createElement('div'); overlay.className = 'sr-countdown-overlay';
    const num = doc.createElement('div'); num.className = 'sr-count-num';
    const cap = doc.createElement('div'); cap.className = 'sr-count-cap'; cap.textContent = action.caption || 'Your demo is about to play';
    overlay.appendChild(num); overlay.appendChild(cap); overlayParent(doc).appendChild(overlay);
    const labels = []; for (let n = from; n >= 1; n--) labels.push(String(n)); labels.push(action.goText || 'Go');
    for (const label of labels) { if (ctx.signal?.aborted) break; num.textContent = label; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); await sleep(Number(action.stepMs) || DEFAULTS.countdown.stepMs, ctx.signal); }
    overlay.remove();
  }
  function dispatchValue(el, value) { const EventCtor = el.ownerDocument.defaultView.Event; el.value = value; el.dispatchEvent(new EventCtor('input', { bubbles: true })); el.dispatchEvent(new EventCtor('change', { bubbles: true })); }
  function ripple(doc, el) { ensureStyles(doc); const rect = el.getBoundingClientRect(); const dot = doc.createElement('div'); dot.className = 'sr-click-ripple'; dot.style.left = `${rect.left + rect.width / 2}px`; dot.style.top = `${rect.top + rect.height / 2}px`; overlayParent(doc).appendChild(dot); setTimeout(() => dot.remove(), RIPPLE_REMOVE_MS); }
  async function runGlow(action, ctx) {
    const elements = queryAll(ctx.document, action.selector).slice(0, Number(action.count) || GLOW_FALLBACK_COUNT); if (!elements.length) return false;
    ensureStyles(ctx.document); const box = ctx.document.createElement('div'); box.className = 'sr-glow-box'; overlayParent(ctx.document).appendChild(box);
    // The glow box cannot carry the dim shadow itself: its ring mask would clip the shadow away.
    const level = dimLevel(action, ctx); let backdrop = null; let current = null;
    const place = (el) => { current = el; placeBox(box, el); if (!level) return; if (backdrop) placeBox(backdrop, el); else backdrop = createDimBackdrop(ctx.document, el, level); };
    const stopFollowing = followTarget(ctx.window, () => { if (current) place(current); });
    if (action.sequence) for (const el of elements) { await ensureInView(el, ctx); place(el); await sleep(action.stepMs || GLOW_FALLBACK_STEP_MS, ctx.signal); }
    else { await ensureInView(elements[0], ctx); place(elements[0]); await sleep(action.holdMs || DEFAULTS.highlight.holdMs, ctx.signal); }
    if (action.keep === 'untilSceneEnd' || ctx.persist === true) { settleOverlays(action, ctx, [box, backdrop], stopFollowing); return true; }
    // A timed `keep` lingers the ring only; the page is un-dimmed as soon as the action ends.
    stopFollowing(); backdrop?.remove();
    if (action.keep) setTimeout(() => box.remove(), action.keepMs || KEEP_FALLBACK_MS); else box.remove(); return true;
  }
  const easeInOutQuad = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  async function animateLever(el, target, durMs, ctx) {
    const from = Number(el.value) || 0; const min = Number(el.min) || 0; const max = Number(el.max) || 100; const to = target === 'max' ? max : target === 'min' ? min : Number(target);
    if (!Number.isFinite(to)) return; const started = performance.now(); let lastDispatch = 0; await ctx.moveCursor?.(el);
    await new Promise((resolve) => { const frame = (now) => { if (ctx.signal?.aborted) return resolve(); const p = Math.min(1, (now - started) / (Number(durMs) || DEFAULTS.lever.durMs)); const eased = easeInOutQuad(p); el.value = from + (to - from) * eased; if (p >= 1 || now - lastDispatch > LEVER_INPUT_THROTTLE_MS) { el.dispatchEvent(new ctx.window.Event('input', { bubbles: true })); lastDispatch = now; } if (p < 1) ctx.window.requestAnimationFrame(frame); else { el.dispatchEvent(new ctx.window.Event('change', { bubbles: true })); resolve(); } }; ctx.window.requestAnimationFrame(frame); });
  }
  async function runDrag(action, ctx, el) {
    const destination = resolveElement(ctx.document, action, action.toSelector); const sourceRect = el.getBoundingClientRect(); const targetRect = destination?.getBoundingClientRect();
    const sx = sourceRect.left + (action.offsetX ?? sourceRect.width / 2); const sy = sourceRect.top + (action.offsetY ?? Math.min(DRAG_GRAB_MAX_OFFSET_Y_PX, sourceRect.height / 2)); const dx = targetRect ? targetRect.left + targetRect.width / 2 - sx : Number(action.dx) || 0; const dy = targetRect ? targetRect.top + targetRect.height / 2 - sy : Number(action.dy) || 0;
    const Pointer = ctx.window.PointerEvent || ctx.window.MouseEvent; const Mouse = ctx.window.MouseEvent; const event = (type, Ctor, x, y, pressed) => new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: ctx.window, clientX: x, clientY: y, button: 0, buttons: pressed ? 1 : 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' });
    await ctx.moveCursor?.(el); el.dispatchEvent(event('pointerdown', Pointer, sx, sy, true)); el.dispatchEvent(event('mousedown', Mouse, sx, sy, true)); const started = performance.now(); const duration = Number(action.durMs) || DEFAULTS.drag.durMs;
    await new Promise((resolve) => { const frame = (now) => { const p = Math.min(1, (now - started) / duration); const x = sx + dx * p; const y = sy + dy * p; ctx.window.dispatchEvent(event('pointermove', Pointer, x, y, true)); ctx.window.dispatchEvent(event('mousemove', Mouse, x, y, true)); ctx.window.__screenreelCursor?.moveToPoint?.(x, y, 1); if (!ctx.signal?.aborted && p < 1) ctx.window.requestAnimationFrame(frame); else { ctx.window.dispatchEvent(event('pointerup', Pointer, x, y, false)); ctx.window.dispatchEvent(event('mouseup', Mouse, x, y, false)); resolve(); } }; ctx.window.requestAnimationFrame(frame); });
  }
  /* Flow variables. {{name}} placeholders resolve against ctx.variables in DISPLAY/VALUE fields
     only — the allowlist below. Selectors, function names, and goto urls are deliberately
     excluded: variables can arrive from the share-link URL, and a URL-controlled selector would
     break validation guarantees while a URL-controlled goto is an open redirect (the projector's
     default router assigns location.href without re-normalizing at play time). Single pass, no
     recursive expansion; unknown names stay literal so flows without variables are byte-identical. */
  const INTERPOLATED_FIELDS = ['title', 'text', 'note', 'value', 'label', 'code', 'caption', 'goText', 'narration'];
  const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_]\w*)\s*\}\}/g;
  function interpolate(value, variables) {
    const missing = [];
    if (typeof value !== 'string' || !value.includes('{{')) return { value, missing };
    const resolved = value.replace(VARIABLE_PATTERN, (whole, name) => {
      if (variables && Object.prototype.hasOwnProperty.call(variables, name)) return String(variables[name]);
      missing.push(name);
      return whole;
    });
    return { value: resolved, missing };
  }
  /* Flattens a flow's variables declaration ({ name: 'default' } or { name: { label, default } })
     into a plain { name: default } map, dropping invalid names. */
  function variableDefaults(declared) {
    const defaults = {};
    for (const [name, spec] of Object.entries(declared || {})) {
      if (!/^[A-Za-z_]\w*$/.test(name)) continue;
      defaults[name] = typeof spec === 'object' && spec !== null ? String(spec.default ?? '') : String(spec ?? '');
    }
    return defaults;
  }
  function resolveActionVariables(action, variables, warn) {
    if (!variables) return action;
    const resolved = { ...action };
    const unresolved = new Set();
    for (const field of INTERPOLATED_FIELDS) {
      const { value, missing } = interpolate(resolved[field], variables);
      resolved[field] = value;
      missing.forEach((name) => unresolved.add(name));
    }
    if (unresolved.size && warn) warn(`Unresolved demo variable(s): ${[...unresolved].join(', ')}`);
    return resolved;
  }
  async function runAction(source, context = {}) {
    const action = resolveActionVariables({ ...source, type: actionType(source) }, context.variables, context.warn); const doc = context.document || root.document; const win = context.window || doc?.defaultView || root; const ctx = { ...context, document: doc, window: win, warn: context.warn || ((message) => console.warn('[screenreel]', message)) };
    if (!doc) return { ok: false, error: 'document' };
    if (action.note && ctx.announce) ctx.announce(action.note);
    /* An action's own line is spoken as the action starts and deliberately not awaited: narration
       runs alongside the visual it describes, and a queued line would drift behind the picture. */
    const narration = actionNarration(action);
    if (narration && ctx.narrateAction) ctx.narrateAction(narration);
    if (action.type === 'wait') { await sleep(action.ms || WAIT_FALLBACK_MS, ctx.signal); return { ok: true }; }
    if (action.type === 'countdown') { await runCountdown(action, ctx); if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true }; }
    if (action.type === 'choice') { const result = await runChoice(action, ctx); if (result.ok && action.afterMs) await sleep(action.afterMs, ctx.signal); return result; }
    if (action.type === 'waitFor') { const found = await waitFor(doc, action.selector, action.condition || 'visible', action.timeoutMs || DEFAULTS['wait-for'].timeoutMs, ctx.signal); if (!found) return { ok: false, error: 'timeout' }; if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true }; }
    if (action.type === 'highlight' || action.type === 'glow') { const ok = await runGlow(action, ctx); if (!ok) ctx.warn(`Selector not found: ${action.selector}`); if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok }; }
    if (action.type === 'goto') { await ctx.navigate?.(action.url); return { ok: true, navigated: true }; }
    if (action.type === 'call') { if (!/^[A-Za-z_$][\w$]*$/.test(action.fn || '')) return { ok: false, error: 'function' }; if (action.cursorTo) { const target = await waitFor(doc, action.cursorTo, 'appear', CURSOR_TARGET_WAIT_MS, ctx.signal); if (target && target !== true) await ctx.moveCursor?.(target); } const fn = context.resolveFunction?.(action.fn) || (context.strictFunctions ? undefined : win[action.fn]); if (typeof fn !== 'function') return { ok: false, error: 'function' }; await fn(...(Array.isArray(action.args) ? action.args : [])); if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true }; }
    let el = action.selector ? resolveElement(doc, action) : null; if (action.selector && !el) el = await waitFor(doc, action.selector, 'appear', action.timeoutMs || ELEMENT_WAIT_TIMEOUT_MS, ctx.signal); if (action.selector && (!el || el === true)) { ctx.warn(`Selector not found: ${action.selector}`); return { ok: false, error: 'selector' }; }
    if (el && el !== true && action.type !== 'scrollIntoView' && action.type !== 'scroll') await ensureInView(el, ctx);
    if (action.type === 'spotlight') {
      /* The dim lives on the shared backdrop (layered under the presenter pill), not on the ring:
         a spread shadow on the ring box sat above the pill and darkened the presenter's controls.
         Spotlight exists to dim, so it ignores the host's highlight `dim` default. */
      ensureStyles(doc); const backdrop = createDimBackdrop(doc, el, Number(action.dim) || DEFAULTS.spotlight.dim);
      const box = doc.createElement('div'); box.className = 'sr-action-box'; placeBox(box, el); overlayParent(doc).appendChild(box);
      const stopFollowing = followTarget(win, () => { placeBox(box, el); placeBox(backdrop, el); });
      await sleep(action.holdMs || DEFAULTS.spotlight.holdMs, ctx.signal); settleOverlays(action, ctx, [box, backdrop], stopFollowing);
    }
    else if (action.type === 'callout') await runCallout(action, ctx, el);
    else if (action.type === 'flash') await runFlash(action, ctx, el);
    else if (action.type === 'reel') await runReel(action, ctx, el);
    else if (action.type === 'reveal') await runReveal(action, ctx, el);
    else if (action.type === 'snippet') await runSnippet(action, ctx, el);
    else if (action.type === 'click') { await ctx.moveCursor?.(el); await ctx.pressCursor?.(); ripple(doc, el); el.click(); }
    else if (action.type === 'hover') { await ctx.moveCursor?.(el); ['pointerover', 'mouseover', 'mouseenter'].forEach((type) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: type !== 'mouseenter', view: win }))); await sleep(action.holdMs || DEFAULTS.hover.holdMs, ctx.signal); }
    else if (action.type === 'focus') { await ctx.moveCursor?.(el); el.focus({ preventScroll: false }); }
    else if (action.type === 'type') { await ctx.moveCursor?.(el); el.focus(); if (action.clearFirst !== false) dispatchValue(el, ''); let value = action.clearFirst === false ? String(el.value || '') : ''; for (const char of String(action.text ?? action.value ?? '')) { value += char; el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(action.charMs ?? DEFAULTS.type.charMs, ctx.signal); } el.dispatchEvent(new win.Event('change', { bubbles: true })); }
    else if (action.type === 'set') { await ctx.moveCursor?.(el); await ctx.pressCursor?.(); dispatchValue(el, action.value ?? ''); }
    else if (action.type === 'toggle') { await ctx.moveCursor?.(el); await ctx.pressCursor?.(); if (!!el.checked !== !!action.checked) el.click(); }
    else if (action.type === 'lever') await animateLever(el, action.to, action.durMs, ctx);
    else if (action.type === 'drag') await runDrag(action, ctx, el);
    else if (action.type === 'pointer') { await ctx.moveCursor?.(el); await ctx.pressCursor?.(); ripple(doc, el); const rect = el.getBoundingClientRect(); const Pointer = win.PointerEvent || win.MouseEvent; const opts = { bubbles: true, cancelable: true, composed: true, view: win, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse' }; el.dispatchEvent(new Pointer('pointerdown', { ...opts, buttons: 1 })); el.dispatchEvent(new Pointer('pointerup', opts)); }
    else if (action.type === 'scrollIntoView') { el.scrollIntoView({ behavior: 'smooth', block: action.block || 'center' }); await waitForScrollEnd(ctx); }
    else if (action.type === 'scroll') { const box = el || doc.scrollingElement; let top = box.scrollTop; let left = box.scrollLeft; if (action.mode === 'relative') { const direction = ['up', 'left'].includes(action.direction) ? -1 : 1; const horizontal = ['left', 'right'].includes(action.direction); const basis = action.unit === 'pixels' ? 1 : action.unit === 'pagePercent' ? (horizontal ? box.scrollWidth : box.scrollHeight) / 100 : (horizontal ? win.innerWidth : win.innerHeight) / 100; if (horizontal) left += direction * Number(action.amount || 0) * basis; else top += direction * Number(action.amount || 0) * basis; } else if (action.mode === 'edge') { if (action.edge === 'bottom') top = box.scrollHeight; else if (action.edge === 'right') left = box.scrollWidth; else if (action.edge === 'left') left = 0; else top = 0; } else { top = action.top ?? top; left = action.left ?? left; } box.scrollTo({ top, left, behavior: 'smooth' }); await waitForScrollEnd(ctx, box); }
    else return { ok: false, error: 'unsupported' };
    if (action.afterMs) await sleep(action.afterMs, ctx.signal); return { ok: true };
  }
  function validate(action, doc, baseHref) {
    const errors = []; const definition = definitionForAction(action); if (!definition) return ['Unsupported action type'];
    if (definition.picker !== 'none' && !action.selector) errors.push('Choose a target');
    if (definition.picker === 'source-destination' && !action.toSelector && action.dx == null && action.dy == null) errors.push('Choose a destination or provide a drag distance');
    if (actionType(action) === 'goto' && !normalizeRoute(action.url, baseHref)) errors.push('Use a valid local route');
    if (actionType(action) === 'choice') {
      const options = Array.isArray(action.options) ? action.options : [];
      if (options.length < CHOICE_MIN_OPTIONS || options.length > CHOICE_MAX_OPTIONS) errors.push(`Provide ${CHOICE_MIN_OPTIONS}-${CHOICE_MAX_OPTIONS} options`);
      if (options.some((option) => !String(option?.label ?? '').trim() || !String(option?.scene ?? '').trim())) errors.push('Every option needs a label and a scene id');
      if (Number(action.timeoutMs) > 0 && !String(action.defaultScene ?? '').trim()) errors.push('Set a default scene when auto-continue is enabled');
    }
    if (actionType(action) === 'call' && !/^[A-Za-z_$][\w$]*$/.test(action.fn || '')) errors.push('Use a valid function name');
    for (const key of ['selector', 'toSelector', 'cursorTo']) { if (!action[key] || !doc) continue; const count = queryAll(doc, action[key]).length; const collection = key === 'selector' && definition.picker === 'collection'; if (!count) errors.push(`${key} has no matches`); else if (!collection && count > 1 && action.index == null) errors.push(`${key} matches multiple elements`); }
    for (const spec of [...(definition.fields || []), { key: 'afterMs', min: 0, max: AFTER_MS_MAX }]) if (spec.type === 'number' && action[spec.key] != null && action[spec.key] !== '') { const value = Number(action[spec.key]); if (!Number.isFinite(value) || (spec.min != null && value < spec.min) || (spec.max != null && value > spec.max)) errors.push(`${spec.label || spec.key} is outside the allowed range`); }
    return errors;
  }
  /* Flow-level graph validation: every choice target must be a real, ENABLED scene. A target
     filtered out by enabledScenes() would be a silent no-op at runtime, so it's an error here.
     Pure — usable from Studio save(), CLI validate, and unit tests without a browser. */
  function validateFlowGraph(flow) {
    const errors = [];
    const enabled = new Set((flow?.scenes || []).filter((scene) => scene.enabled !== false).map((scene) => scene.id));
    const known = new Set((flow?.scenes || []).map((scene) => scene.id));
    for (const scene of flow?.scenes || []) {
      (scene.actions || []).forEach((action, index) => {
        if (actionType(action) !== 'choice') return;
        const targets = [...(Array.isArray(action.options) ? action.options.map((option) => option?.scene) : []), action.defaultScene].filter(Boolean).map(String);
        for (const target of targets) {
          if (!known.has(target)) errors.push(`${scene.id} action ${index + 1}: choice targets unknown scene "${target}"`);
          else if (!enabled.has(target)) errors.push(`${scene.id} action ${index + 1}: choice targets disabled scene "${target}"`);
        }
      });
    }
    return errors;
  }
  const INSPECT_TEXT_LIMIT = 120, INSPECT_LIMIT = 500; // fingerprint/inspection bounds
  const interactiveSelector = 'button,a[href],input,select,textarea,[role="button"],[role="switch"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  function isBroad(el, doc) { if (!el || ['BODY', 'HTML', 'MAIN'].includes(el.tagName) || el.getAttribute('role') === 'tabpanel' || el.hasAttribute('data-panel')) return true; const rect = el.getBoundingClientRect(); return rect.width * rect.height > doc.defaultView.innerWidth * doc.defaultView.innerHeight * BROAD_TARGET_VIEWPORT_SHARE; }
  function visualCandidate(el, doc) { if (!el || isBroad(el, doc)) return false; const rect = el.getBoundingClientRect(); if (rect.width < VISUAL_MIN_WIDTH_PX || rect.height < VISUAL_MIN_HEIGHT_PX) return false; const style = doc.defaultView.getComputedStyle(el); const padded = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((key) => parseFloat(style[key]) >= VISUAL_MIN_PADDING_PX); return style.borderStyle !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(style.borderRadius) >= VISUAL_MIN_RADIUS_PX || padded; }
  function resolvePickerTarget(exact, policy, doc = exact?.ownerDocument) { if (!exact || !doc) return null; if (policy === 'interactive') return exact.closest(interactiveSelector) || exact; if (policy === 'visual' || policy === 'collection') for (let el = exact; el && el !== doc.body; el = el.parentElement) if (visualCandidate(el, doc)) return el; return isBroad(exact, doc) ? null : exact; }
  const escapeCss = (value) => root.CSS?.escape ? root.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  function selectorFor(el) {
    const doc = el?.ownerDocument; if (!doc || !el) return null; const unique = (selector) => queryAll(doc, selector).length === 1;
    const demoId = el.getAttribute('data-demo-id'); if (demoId) return `[data-demo-id="${String(demoId).replace(/"/g, '\\"')}"]`;
    if (el.id && unique(`#${escapeCss(el.id)}`)) return `#${escapeCss(el.id)}`;
    for (const attr of [...el.attributes].filter((item) => item.name.startsWith('data-') && !item.name.startsWith('data-screenreel'))) { const selector = `[${attr.name}="${String(attr.value).replace(/"/g, '\\"')}"]`; if (attr.value && unique(selector)) return selector; }
    const parts = []; let node = el; while (node && node !== doc.body && parts.length < SELECTOR_MAX_DEPTH) { let part = node.tagName.toLowerCase(); const classes = [...node.classList].filter((name) => !name.startsWith('sr-') && !name.startsWith('screenreel-')).slice(0, SELECTOR_MAX_CLASSES); if (classes.length) part += classes.map((name) => `.${escapeCss(name)}`).join(''); const siblings = node.parentElement ? [...node.parentElement.children].filter((item) => item.tagName === node.tagName) : []; if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`; parts.unshift(part); const selector = parts.join(' > '); if (unique(selector)) return selector; node = node.parentElement; } return parts.join(' > ') || null;
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
  /* A target's human-recognisable identity, stored on actions so `flow doctor` can re-match them
     after a selector is renamed. Same shape inspectDocument reports, so scoring compares like
     with like. One definition, used by the Studio picker, the recorder, and the doctor. */
  function fingerprintFor(el) {
    if (!el?.tagName) return null;
    return { text: String(el.innerText || el.getAttribute?.('aria-label') || '').trim().slice(0, INSPECT_TEXT_LIMIT), tag: el.tagName.toLowerCase(), role: el.getAttribute?.('role') || '' };
  }
  /* The spoken script for a scene. Live narration (packages/core/narrator.js) and Capture's
     voiceover (lib/voice.mjs narrationText) must always speak the same words for the same scene;
     test/narrator.test.mjs asserts the two agree. Empty means a silent scene, not an error.

     A scene's transcript is its own line followed by one line per action. The two speakers reach it
     differently and that is the point: the projector speaks sceneNarration() when the scene opens
     and each actionNarration() as that action runs, so the words land on the thing being shown,
     while Capture has no per-action audio timeline and speaks the whole narrationScript() over the
     scene's clip. The words are the shared contract; the timing is each speaker's own. */
  function sceneNarration(scene) {
    return String(scene?.narration ?? scene?.talkingPoints ?? '').trim();
  }
  function actionNarration(action) {
    return String(action?.narration ?? '').trim();
  }
  function narrationScript(scene) {
    return [sceneNarration(scene), ...(scene?.actions || []).map(actionNarration)].filter(Boolean).join(' ');
  }
  function inspectDocument(doc) { return [...doc.querySelectorAll(`${interactiveSelector},[data-demo-id],[data-action]`)].slice(0, INSPECT_LIMIT).map((el) => ({ selector: selectorFor(el), tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', text: String(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, INSPECT_TEXT_LIMIT), interactive: !!el.closest(interactiveSelector) })).filter((item) => item.selector); }

  root.ScreenReelCore = { LAYER_ID, overlayParent, placeCallout, ELEMENT_WAIT_TIMEOUT_MS, AFTER_MS_MAX, definitions, recipes, supportedTypes, aliases, actionType, getDefinition: (id) => byId.get(id) || null, definitionForAction, normalizeRoute, runAction, validate, validateFlowGraph, fingerprintFor, sceneNarration, actionNarration, narrationScript, sleep, setTimeScale, timeScale: () => timeScale, interpolate, variableDefaults, resolveActionVariables, waitFor, resolvePickerTarget, selectorFor, selectorForCollection, inspectDocument };
})(globalThis);
