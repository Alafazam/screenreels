const toast = (message) => { const node = document.getElementById('toast'); node.textContent = message; node.hidden = false; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => { node.hidden = true; }, 1800); };
document.querySelector('[data-action="reveal-delayed"]')?.addEventListener('click', () => setTimeout(() => { document.getElementById('delayed-target').hidden = false; }, 650));
document.getElementById('confidence')?.addEventListener('input', (event) => { document.getElementById('confidence-output').textContent = `${event.target.value}%`; });
document.getElementById('submit-control')?.addEventListener('click', () => toast('Controls applied'));
document.getElementById('pointer-target')?.addEventListener('pointerdown', () => toast('Raw pointer event received'));
window.showScreenReelResult = async (message = 'Page function called') => { await new Promise((resolve) => setTimeout(resolve, 120)); document.getElementById('hero-result').textContent = message; toast(message); };
const demoButton = document.getElementById('demo-button');
if (demoButton) {
  window.ScreenReel.registerFn('showScreenReelResult', window.showScreenReelResult);
  window.ScreenReel.mount(demoButton, { projectId: 'action-showcase', flow: { src: 'screenreel.demo.json' }, loop: false });
  document.querySelector('[data-action="open-demo"]')?.addEventListener('click', () => demoButton.click());
}
