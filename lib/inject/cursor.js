// Fake cursor for headless capture. Injected by screenreel via addInitScript so
// the recorded footage shows a cursor travelling to each target like a real
// screen recording. Globals are screenreel-prefixed so this never clashes with
// a host app's own demo tooling.
(function () {
  if (window.__screenreelCursor) return;

  let el = null;
  let x = innerWidth / 2;
  let y = innerHeight / 2;

  function ensure() {
    if (el && document.body && document.body.contains(el)) return el;
    if (!document.body) return null;
    el = document.createElement('div');
    el.id = '__screenreelCursor';
    el.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;' +
      'left:0;top:0;transform:translate(' + x + 'px,' + y + 'px);will-change:transform;';
    el.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">' +
      '<path d="M5.5 3.2 19 12.6l-6.1 1.1 3.1 6.2-2.5 1.2-3.1-6.3-4.4 4.4z" fill="#111" stroke="#fff" stroke-width="1.4"/></svg>';
    document.body.appendChild(el);
    return el;
  }

  function tween(tx, ty, ms) {
    return new Promise((resolve) => {
      const fx = x, fy = y;
      const start = performance.now();
      (function frame(now) {
        const t = Math.min(1, (now - start) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        x = fx + (tx - fx) * e;
        y = fy + (ty - fy) * e;
        const cur = ensure();
        if (cur) cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      })(start);
    });
  }

  window.__screenreelCursor = {
    show() { ensure(); },
    async moveTo(target, ms) {
      ensure();
      const r = target.getBoundingClientRect();
      const dist = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      await tween(r.left + r.width / 2, r.top + r.height / 2, ms || Math.min(900, 250 + dist * 0.6));
      await new Promise(res => setTimeout(res, 120)); // beat before the click lands
    },
    async moveToPoint(px, py, ms) { ensure(); await tween(px, py, ms || 600); },
  };

  document.addEventListener('DOMContentLoaded', ensure);
})();
