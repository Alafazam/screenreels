const toast = (message) => { const node = document.getElementById('toast'); node.textContent = message; node.hidden = false; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => { node.hidden = true; }, 1800); };
document.querySelector('[data-action="show-message"]')?.addEventListener('click', () => { document.getElementById('hero-result').textContent = 'Projector action completed'; toast('Visible result landed'); });
document.querySelector('[data-action="reveal-delayed"]')?.addEventListener('click', () => setTimeout(() => { document.getElementById('delayed-target').hidden = false; }, 650));
document.getElementById('confidence')?.addEventListener('input', (event) => { document.getElementById('confidence-output').textContent = `${event.target.value}%`; });
document.getElementById('submit-control')?.addEventListener('click', () => toast('Controls applied'));
document.getElementById('pointer-target')?.addEventListener('pointerdown', () => toast('Raw pointer event received'));
window.showScreenReelResult = (message = 'Page function called') => { document.getElementById('hero-result').textContent = message; toast(message); };
