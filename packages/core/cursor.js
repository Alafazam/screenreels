/* ScreenReel agent cursor: the single pointer implementation shared by Projector and Capture.
   Projector loads it through the runtime loader; Capture injects this same file with
   addInitScript so recorded footage and the live tour show an identical pointer.
   Globals are screenreel-prefixed so this never clashes with a host app's own tooling. */
(function initScreenReelCursor(root) {
  if (root.__screenreelCursor) return;

  const SIZE_PX = 22;                 // pointer diameter (dot glyph)
  const ARROW_SIZE_PX = 26;           // pointer box for the arrow glyph
  const TRAVEL_BASE_MS = 180;         // fixed cost of any move
  const TRAVEL_PER_PX_MS = 0.45;      // added travel time per pixel of distance
  const TRAVEL_MAX_MS = 700;          // ceiling so long jumps stay watchable
  const SETTLE_MS = 90;               // beat between arriving and acting
  const RING_COUNT = 2;               // rings emitted on arrival
  const RING_STAGGER_MS = 110;        // delay between successive arrival rings
  const RING_LIFE_MS = 620;           // must match the sr-cursor-ring animation
  const PRESS_MS = 180;               // press dip duration
  const BOB_AMPLITUDE_PX = 7;         // vertical drift while the page scrolls
  const BOB_PERIOD_MS = 620;          // one full bob cycle
  const ARC_RATIO = 0.18;             // control-point offset as a fraction of travel distance
  const ARC_MAX_PX = 120;             // ceiling on how far a curve bulges, however long the move
  const ARC_MIN_DISTANCE_PX = 48;     // below this, a curve reads as jitter rather than motion
  const OVERSHOOT_MAX_PX = 10;        // how far a long move can sail past its target
  const OVERSHOOT_RETURN_MS = 90;     // beat spent correcting back onto the target
  const OVERSHOOT_MIN_DISTANCE_PX = 200; // only long moves overshoot; short ones would look jittery
  const OVERSHOOT_DISTANCE_RATIO = 0.03;  // overshoot grows with distance, up to OVERSHOOT_MAX_PX
  const RING_REMOVE_SLACK_MS = 80;    // keep a ring node a beat past its animation so it never pops
  const BOB_FRAME_MS = 16;            // bob repaint interval (~60fps)
  /* Arc jitter: a deterministic 0.75–1.25 multiplier hashed from the endpoints (see tween). */
  const JITTER_MIN = 0.75, JITTER_RANGE = 0.5, JITTER_HASH_STRIDES = [7, 13, 31], JITTER_BUCKETS = 100;
  const STYLE_ID = '__screenreelCursorStyles';
  const NODE_ID = '__screenreelCursor';

  const GLYPHS = {
    dot: '<span class="sr-cursor-dot"></span>',
    arrow:
      '<svg width="26" height="26" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">' +
      '<path d="M5.5 3.2 19 12.6l-6.1 1.1 3.1 6.2-2.5 1.2-3.1-6.3-4.4 4.4z" fill="#111" stroke="#fff" stroke-width="1.4"/></svg>',
  };

  const CSS = [
    `#${NODE_ID}{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;`,
    `width:${SIZE_PX}px;height:${SIZE_PX}px;will-change:transform;transition:opacity .2s ease}`,
    `#${NODE_ID}[data-glyph="arrow"]{width:${ARROW_SIZE_PX}px;height:${ARROW_SIZE_PX}px}`,
    `#${NODE_ID}[hidden]{opacity:0}`,
    '.sr-cursor-dot{display:block;width:100%;height:100%;border-radius:50%;',
    'background:rgba(24,24,27,.82);border:2px solid rgba(255,255,255,.94);',
    'box-shadow:0 2px 10px rgba(9,9,11,.42),0 0 0 1px rgba(9,9,11,.16);',
    'transition:transform .18s cubic-bezier(.34,1.56,.64,1)}',
    `#${NODE_ID}[data-pressed="true"] .sr-cursor-dot{transform:scale(.82)}`,
    '.sr-cursor-ring{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;',
    `width:${SIZE_PX}px;height:${SIZE_PX}px;margin:${-SIZE_PX / 2}px 0 0 ${-SIZE_PX / 2}px;`,
    'border:2px solid rgba(124,58,237,.55);animation:sr-cursor-ring var(--sr-ring-life,620ms) cubic-bezier(.22,.61,.36,1) forwards}',
    '.sr-cursor-ring.strong{border-color:rgba(124,58,237,.9);border-width:3px}',
    '@keyframes sr-cursor-ring{from{opacity:.85;transform:scale(.55)}to{opacity:0;transform:scale(3.1)}}',
    '@media(prefers-reduced-motion:reduce){.sr-cursor-ring{display:none}.sr-cursor-dot{transition:none}}',
  ].join('');

  const reducedMotion = () => !!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let node = null;
  let glyph = 'dot';
  let motion = 'arc';                 // 'arc' (default) bows moves into a curve; 'line' stays straight
  let arcSide = 1;                    // alternates which side of the travel line each arc bulges toward
  let x = (root.innerWidth || 0) / 2;
  let y = (root.innerHeight || 0) / 2;
  let bobTimer = null;
  let bobOffset = 0;

  function ensureStyles() {
    const doc = root.document;
    if (!doc?.head || doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }

  function paint() {
    if (node) node.style.transform = `translate(${x}px,${y + bobOffset}px)`;
  }

  function ensure() {
    const doc = root.document;
    if (node && doc?.body?.contains(node)) return node;
    if (!doc?.body) return null;
    ensureStyles();
    node = doc.createElement('div');
    node.id = NODE_ID;
    node.setAttribute('aria-hidden', 'true');
    node.dataset.glyph = glyph;
    node.innerHTML = GLYPHS[glyph] || GLYPHS.dot;
    doc.body.appendChild(node);
    paint();
    return node;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }

  /* One expanding ring at the cursor's current position. */
  function emitRing(strong = false, life = RING_LIFE_MS) {
    const doc = root.document;
    if (!doc?.body || reducedMotion()) return;
    ensureStyles();
    const ring = doc.createElement('div');
    ring.className = strong ? 'sr-cursor-ring strong' : 'sr-cursor-ring';
    ring.style.setProperty('--sr-ring-life', `${life}ms`);
    ring.style.left = `${x}px`;
    ring.style.top = `${y + bobOffset}px`;
    doc.body.appendChild(ring);
    setTimeout(() => ring.remove(), life + RING_REMOVE_SLACK_MS);
  }

  /* Concentric arrival rings: the "you are here" cue. */
  function ping(count = RING_COUNT) {
    if (reducedMotion()) return;
    for (let index = 0; index < count; index++) {
      if (index === 0) emitRing(false);
      else setTimeout(() => emitRing(false), RING_STAGGER_MS * index);
    }
  }

  function tween(targetX, targetY, ms) {
    if (reducedMotion() || !ms) {
      x = targetX; y = targetY; ensure(); paint();
      return Promise.resolve();
    }
    const fromX = x;
    const fromY = y;
    const distance = Math.hypot(targetX - fromX, targetY - fromY);
    // Short hops (drag's per-frame 1ms calls included) stay straight — a curve only reads as
    // motion once there's enough distance for the eye to follow it.
    const arced = motion === 'arc' && distance >= ARC_MIN_DISTANCE_PX;
    let controlX = 0;
    let controlY = 0;
    if (arced) {
      arcSide = -arcSide; // alternate which side of the travel line successive arcs bulge toward
      const midX = (fromX + targetX) / 2;
      const midY = (fromY + targetY) / 2;
      const perpX = -(targetY - fromY) / distance;
      const perpY = (targetX - fromX) / distance;
      // Deterministic "jitter" derived from the endpoint coordinates rather than Math.random():
      // the same start/end points always produce the same curve, so a captured video is
      // reproducible frame-for-frame across runs.
      const [strideA, strideB, strideC] = JITTER_HASH_STRIDES;
      const hash = Math.abs(Math.round(fromX + fromY * strideA + targetX * strideB + targetY * strideC));
      const jitter = JITTER_MIN + ((hash % JITTER_BUCKETS) / JITTER_BUCKETS) * JITTER_RANGE;
      const offset = Math.min(ARC_MAX_PX, distance * ARC_RATIO) * jitter * arcSide;
      controlX = midX + perpX * offset;
      controlY = midY + perpY * offset;
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = easeInOutQuad(t);
        if (arced) {
          const inv = 1 - eased;
          x = inv * inv * fromX + 2 * inv * eased * controlX + eased * eased * targetX;
          y = inv * inv * fromY + 2 * inv * eased * controlY + eased * eased * targetY;
        } else {
          x = fromX + (targetX - fromX) * eased;
          y = fromY + (targetY - fromY) * eased;
        }
        ensure();
        paint();
        if (t < 1) root.requestAnimationFrame(frame); else resolve();
      };
      root.requestAnimationFrame(frame);
    });
  }

  function travelMs(distance) {
    return Math.min(TRAVEL_MAX_MS, TRAVEL_BASE_MS + distance * TRAVEL_PER_PX_MS);
  }

  /* Travels to a point, overshooting slightly past it on long arced moves and correcting back —
     the settle reads as a deliberate arrival rather than a robotic snap onto the target. Short
     moves, straight-line motion, and reduced-motion all skip straight to a plain tween. */
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  async function tweenWithOvershoot(toX, toY, ms) {
    const distance = Math.hypot(toX - x, toY - y);
    if (motion === 'arc' && distance > OVERSHOOT_MIN_DISTANCE_PX && !reducedMotion()) {
      const overshootPx = Math.min(OVERSHOOT_MAX_PX, distance * OVERSHOOT_DISTANCE_RATIO);
      const dirX = (toX - x) / distance;
      const dirY = (toY - y) / distance;
      await tween(toX + dirX * overshootPx, toY + dirY * overshootPx, ms);
      await tween(toX, toY, OVERSHOOT_RETURN_MS);
      return;
    }
    await tween(toX, toY, ms);
  }

  root.__screenreelCursor = {
    /* Pick the pointer glyph ('dot' agent style or 'arrow' classic capture look) and travel
       style ('arc', the default, or 'line'). Invalid values are ignored so a bad option never
       stomps the current setting. */
    configure(options = {}) {
      if (options.glyph && GLYPHS[options.glyph] && options.glyph !== glyph) {
        glyph = options.glyph;
        node?.remove();
        node = null;
      }
      if (options.motion === 'arc' || options.motion === 'line') motion = options.motion;
      return this;
    },
    /* Reveals an existing pointer. It deliberately does not create one: the cursor must not
       appear until an action actually moves it, so an idle page shows no stray dot. */
    show() { if (node) node.hidden = false; return this; },
    hide() { if (node) node.hidden = true; this.stopBob(); return this; },
    position() { return { x, y }; },
    ping,
    emitRing,

    /* Travel to an element's centre, announce arrival with rings, then settle. */
    async moveTo(target, ms) {
      ensure();
      const rect = target?.getBoundingClientRect?.();
      if (!rect) return this;
      const toX = rect.left + rect.width / 2;
      const toY = rect.top + rect.height / 2;
      const distance = Math.hypot(toX - x, toY - y);
      await tweenWithOvershoot(toX, toY, ms || travelMs(distance));
      ping();
      await wait(SETTLE_MS);
      return this;
    },

    async moveToPoint(pointX, pointY, ms) {
      ensure();
      await tweenWithOvershoot(pointX, pointY, ms == null ? travelMs(Math.hypot(pointX - x, pointY - y)) : ms);
      return this;
    },

    /* Press feedback: the dot dips and a brighter ring bursts from the same point. */
    async press() {
      const el = ensure();
      if (!el) return this;
      el.dataset.pressed = 'true';
      emitRing(true, RING_LIFE_MS);
      await wait(PRESS_MS);
      el.dataset.pressed = 'false';
      return this;
    },

    /* Small vertical drift while the page scrolls, so motion looks cursor-driven.
       Idempotent: calling it again just re-aims the existing bob. */
    startBob(direction = 1) {
      ensure();
      if (reducedMotion()) return this;
      const sign = direction < 0 ? -1 : 1;
      const start = performance.now();
      clearInterval(bobTimer);
      bobTimer = setInterval(() => {
        const phase = ((performance.now() - start) % BOB_PERIOD_MS) / BOB_PERIOD_MS;
        bobOffset = Math.sin(phase * Math.PI * 2) * BOB_AMPLITUDE_PX * sign;
        paint();
      }, BOB_FRAME_MS);
      return this;
    },
    stopBob() {
      clearInterval(bobTimer);
      bobTimer = null;
      bobOffset = 0;
      paint();
      return this;
    },
    destroy() {
      this.stopBob();
      node?.remove();
      node = null;
      root.document?.getElementById(STYLE_ID)?.remove();
      return this;
    },
  };

})(globalThis);
