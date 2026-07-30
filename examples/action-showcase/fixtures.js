/* Shared demo-page fixtures. Loaded by index.html (form controls) and destination.html
   (drag board, pointer target, delayed state), so the behaviour has one home on both routes.
   Every lookup is optional — each page only carries the fixtures it needs.

   Wrapped in an IIFE: this and app.js are classic scripts sharing one global scope, so any
   top-level binding here could collide with one there and kill the whole script. */
(function initFixtures() {
const TOAST_MS = 1800;
const DELAYED_REVEAL_MS = 650;
const PAGE_FN_LATENCY_MS = 120;

let toastTimer = null;
function toast(message) {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, TOAST_MS);
}

document.querySelector('[data-action="reveal-delayed"]')?.addEventListener('click', () => {
  setTimeout(() => { const target = document.getElementById('delayed-target'); if (target) target.hidden = false; }, DELAYED_REVEAL_MS);
});
document.getElementById('confidence')?.addEventListener('input', (event) => {
  document.getElementById('confidence-output').textContent = `${event.target.value}%`;
});
document.getElementById('submit-control')?.addEventListener('click', () => toast('Demo rocked 🤘'));
document.getElementById('pointer-target')?.addEventListener('pointerdown', () => toast('Raw pointer event received'));

/* Registered with the runtime as a safe, component-owned function — the `call` action can only
   reach functions a page opts in this way, never arbitrary JavaScript. */
window.showScreenReelResult = async (message = 'Page function called') => {
  await new Promise((resolve) => setTimeout(resolve, PAGE_FN_LATENCY_MS));
  const result = document.getElementById('hero-result');
  if (result) result.textContent = message;
  toast(message);
};
window.ScreenReel?.registerFn('showScreenReelResult', window.showScreenReelResult);
})();
