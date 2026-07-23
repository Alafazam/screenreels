const toast = (message) => { const node = document.getElementById('toast'); node.textContent = message; node.hidden = false; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => { node.hidden = true; }, 1800); };
document.querySelector('[data-action="reveal-delayed"]')?.addEventListener('click', () => setTimeout(() => { document.getElementById('delayed-target').hidden = false; }, 650));
document.getElementById('confidence')?.addEventListener('input', (event) => { document.getElementById('confidence-output').textContent = `${event.target.value}%`; });
document.getElementById('submit-control')?.addEventListener('click', () => toast('Controls applied'));
document.getElementById('pointer-target')?.addEventListener('pointerdown', () => toast('Raw pointer event received'));
window.showScreenReelResult = (message = 'Page function called') => { document.getElementById('hero-result').textContent = message; toast(message); };
window.addEventListener('DOMContentLoaded', () => {
  const demoButton = document.getElementById('demo-button');
  if (!demoButton) return;
  window.ScreenReel.ready.then((api) => api.mount(demoButton, { projectId: 'action-showcase', flow: { src: 'screenreel.demo.json' } }));
  document.querySelector('[data-action="open-demo"]')?.addEventListener('click', () => demoButton.click());
});
