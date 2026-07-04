// Screenreel director — the in-page action runner, injected via addInitScript.
// A slimmed extraction of the ms-planning-brain prototype's demo-director: only
// the capture path survives (no tour UI, no captions, no narration, no
// sessionStorage playback state). The scene object is passed INTO runActions by
// the Playwright rig — nothing is fetched, so any app works with zero
// integration. Globals and CSS classes are screenreel-prefixed to avoid
// clashing with host-app demo tooling.
(function () {
  if (window.__screenreel) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Styles for the glow/ripple visuals ride along with the director so the
  // host app needs no stylesheet. Registered once per page.
  function ensureStyles() {
    if (document.getElementById('__screenreelStyles')) return;
    const css = `
@property --sr-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
.sr-glow-box {
  position: fixed; z-index: 2147483000; pointer-events: none;
  border-radius: 16px; border: 3px solid transparent;
  background: conic-gradient(from var(--sr-angle),
    #ff5e5e, #ffb84d, #ffe74d, #6ef08c, #4dc9ff, #7c6ef0, #d05ef0, #ff5ec8, #ff5e5e) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  filter: drop-shadow(0 0 12px rgba(124, 58, 237, 0.35));
  transition: left 0.45s cubic-bezier(0.4,0,0.2,1), top 0.45s cubic-bezier(0.4,0,0.2,1),
    width 0.45s cubic-bezier(0.4,0,0.2,1), height 0.45s cubic-bezier(0.4,0,0.2,1);
  animation: sr-glow-spin 2s linear infinite;
}
.sr-glow-keep { animation: sr-glow-spin 2s linear infinite, sr-glow-fade 4s ease forwards; }
@keyframes sr-glow-spin { to { --sr-angle: 360deg; } }
@keyframes sr-glow-fade { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }
.sr-click-ripple {
  position: fixed; z-index: 2147483100; width: 14px; height: 14px;
  margin: -7px 0 0 -7px; border-radius: 50%;
  background: #7c3aed; pointer-events: none;
  animation: sr-ripple 0.65s ease-out forwards;
}
@keyframes sr-ripple { 0% { opacity: 0.85; transform: scale(0.6); } 100% { opacity: 0; transform: scale(3.2); } }`;
    const style = document.createElement('style');
    style.id = '__screenreelStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function waitFor(probe, timeoutMs) {
    return new Promise((resolve) => {
      const started = Date.now();
      (function poll() {
        const el = probe();
        if (el) return resolve(el);
        if (Date.now() - started > timeoutMs) return resolve(null); // soft-fail: capture keeps going
        setTimeout(poll, 120);
      })();
    });
  }

  // waitFor accepts a comma-separated selector list like querySelector does.
  const waitForEl = (selector, timeoutMs = 8000) =>
    waitFor(() => document.querySelector(selector), timeoutMs);

  async function moveCursor(el) {
    if (window.__screenreelCursor && el) { try { await window.__screenreelCursor.moveTo(el); } catch (e) {} }
  }

  function clickRipple(el) {
    if (!el) return;
    ensureStyles();
    const r = el.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'sr-click-ripple';
    dot.style.left = (r.left + r.width / 2) + 'px';
    dot.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  }

  function setRangeValue(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function animateLever(input, target, durMs) {
    const from = parseFloat(input.value);
    const max = parseFloat(input.max || 100);
    const min = parseFloat(input.min || 0);
    const to = target === 'max' ? max : target === 'min' ? min : parseFloat(target);
    const start = performance.now();
    await moveCursor(input);
    // Throttle 'input' dispatches: heavy views re-render per event, and 60Hz
    // re-render storms leave images perpetually reloading on camera.
    let lastDispatch = 0;
    return new Promise((resolve) => {
      (function frame(now) {
        const t = Math.min(1, (now - start) / durMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const value = from + (to - from) * eased;
        if (t >= 1 || now - lastDispatch > 90) { setRangeValue(input, value); lastDispatch = now; }
        else input.value = value;
        if (t < 1) requestAnimationFrame(frame);
        else { input.dispatchEvent(new Event('change', { bubbles: true })); resolve(); }
      })(start);
    });
  }

  function resolveEl(action) {
    if (!action.selector) return null;
    const all = document.querySelectorAll(action.selector);
    return all[action.index || 0] || null;
  }

  // Rainbow-border highlight. A single overlay box glides between targets
  // (sequence mode) so the viewer's eye can follow one element at a time.
  async function runGlow(action) {
    ensureStyles();
    const els = [...document.querySelectorAll(action.selector)].slice(0, action.count || 12);
    if (!els.length) return;
    const box = document.createElement('div');
    box.className = 'sr-glow-box';
    document.body.appendChild(box);
    const place = (el) => {
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        left: (r.left - 5) + 'px', top: (r.top - 5) + 'px',
        width: (r.width + 10) + 'px', height: (r.height + 10) + 'px',
      });
    };
    if (action.sequence) {
      for (const el of els) {
        place(el);
        moveCursor(el);
        await sleep(action.stepMs || 1100);
      }
    } else {
      place(els[0]);
      moveCursor(els[0]);
      await sleep(action.holdMs || 1600);
    }
    if (action.keep) { box.classList.add('sr-glow-keep'); setTimeout(() => box.remove(), action.keepMs || 4000); }
    else box.remove();
  }

  // Pointer-drag simulation: pointerdown on the element, interpolated
  // pointermove frames on window (+ an optional moveTarget for canvases that
  // listen locally), pointerup at the destination. Cursor overlay follows.
  async function runDrag(action) {
    const el = resolveEl(action);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const sx = r.left + (action.offsetX ?? r.width / 2);
    const sy = r.top + (action.offsetY ?? Math.min(18, r.height / 2));
    const moveTarget = action.moveTarget ? document.querySelector(action.moveTarget) : null;
    const ev = (type, Ctor, x, y, pressed) => new Ctor(type, {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, button: 0, buttons: pressed ? 1 : 0,
      pointerId: 1, isPrimary: true, pointerType: 'mouse',
    });
    await moveCursor(el);
    el.dispatchEvent(ev('pointerdown', PointerEvent, sx, sy, true));
    el.dispatchEvent(ev('mousedown', MouseEvent, sx, sy, true));
    const dur = action.durMs || 900;
    const start = performance.now();
    await new Promise((resolve) => {
      (function frame(now) {
        const t = Math.min(1, (now - start) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = sx + (action.dx || 0) * e;
        const y = sy + (action.dy || 0) * e;
        for (const target of [window, moveTarget]) {
          if (!target) continue;
          target.dispatchEvent(ev('pointermove', PointerEvent, x, y, true));
          target.dispatchEvent(ev('mousemove', MouseEvent, x, y, true));
        }
        window.__screenreelCursor?.moveToPoint?.(x, y, 1);
        if (t < 1) requestAnimationFrame(frame);
        else {
          for (const target of [window, moveTarget]) {
            if (!target) continue;
            target.dispatchEvent(ev('pointerup', PointerEvent, x, y, false));
            target.dispatchEvent(ev('mouseup', MouseEvent, x, y, false));
          }
          resolve();
        }
      })(start);
    });
  }

  async function runAction(action) {
    if (action.type === 'wait') { await sleep(action.ms || 500); return; }
    if (action.type === 'glow') { await runGlow(action); if (action.afterMs) await sleep(action.afterMs); return; }
    if (action.type === 'drag') { await runDrag(action); if (action.afterMs) await sleep(action.afterMs); return; }
    if (action.type === 'goto') { location.href = action.url; return; }
    if (action.type === 'call') {
      // Invoke a page-global function (apps expose demo hooks as classic-script
      // globals). Optional cursorTo makes it read as a user action on camera.
      if (action.cursorTo) {
        const target = await waitForEl(action.cursorTo, 6000);
        if (target) await moveCursor(target);
      }
      const fn = window[action.fn];
      if (typeof fn === 'function') fn(...(action.args || []));
      else console.warn('[screenreel] call: no such function', action.fn);
      if (action.afterMs) await sleep(action.afterMs);
      return;
    }
    const el = action.selector ? (await waitForEl(action.selector, action.timeoutMs || 8000)) && resolveEl(action) : null;
    if (action.selector && !el) { console.warn('[screenreel] selector not found:', action.selector); return; }
    switch (action.type) {
      case 'click':
        await moveCursor(el);
        clickRipple(el);
        el.click();
        break;
      case 'hover':
        await moveCursor(el);
        ['pointerover', 'mouseover', 'mouseenter'].forEach(type =>
          el.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter', view: window })));
        break;
      case 'scroll': {
        const box = el || document.scrollingElement;
        box.scrollTo({ top: action.top ?? box.scrollTop, left: action.left ?? box.scrollLeft, behavior: 'smooth' });
        await sleep(action.durMs || 800);
        break;
      }
      case 'scrollIntoView':
        el.scrollIntoView({ behavior: 'smooth', block: action.block || 'center' });
        await sleep(action.durMs || 700);
        break;
      case 'lever':
        await animateLever(el, action.to, action.durMs || 1200);
        break;
      case 'pointer': {
        // Raw pointerdown+up (bubbling) — for canvases that wire on pointerdown
        // rather than click (e.g. node-editor port dots).
        await moveCursor(el);
        clickRipple(el);
        const r = el.getBoundingClientRect();
        const opts = {
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse',
        };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        break;
      }
      case 'set':
        setRangeValue(el, action.value);
        break;
      case 'fill': {
        // Type into a text input/textarea: focus, set value, fire input events.
        await moveCursor(el);
        el.focus();
        el.value = action.value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
      default:
        console.warn('[screenreel] unknown action type:', action.type);
    }
    if (action.afterMs) await sleep(action.afterMs);
  }

  window.__screenreel = {
    // Run one scene's actions. The scene object is passed in whole by the
    // capture rig — no fetching, no app integration required.
    async runActions(scene) {
      ensureStyles();
      if (scene.waitFor) await waitForEl(scene.waitFor, 15000);
      for (const action of scene.actions || []) {
        try { await runAction(action); } catch (e) { console.warn('[screenreel] action failed', action, e); }
      }
      return true;
    },
  };
})();
