(function initDemoLab() {
  const isStudioPreview = new URLSearchParams(location.search).has('screenreelPreview');
  const ack = document.getElementById('dl-ack');
  const ackText = ack?.querySelector('strong');
  const ackDetail = ack?.querySelector('span:last-child');
  const acknowledge = (title, detail) => { if (ackText) ackText.textContent = title; if (ackDetail) ackDetail.textContent = detail; };
  const name = document.getElementById('dl-demo-name');
  name?.addEventListener('input', () => acknowledge('Story updated', name.value.trim() ? `“${name.value.trim()}” is ready to capture.` : 'Give your demo a name to continue.'));
  document.getElementById('dl-audience')?.addEventListener('change', (event) => acknowledge('Audience updated', `This flow is framed for ${event.target.selectedOptions[0].text.toLowerCase()}.`));
  document.getElementById('dl-presenter-notes')?.addEventListener('change', (event) => acknowledge(event.target.checked ? 'Presenter notes on' : 'Presenter notes off', event.target.checked ? 'Talking points will stay beside the flow.' : 'The flow will stay focused on actions.'));
  const pacing = document.getElementById('dl-pacing');
  const pacingLabels = { 1: 'Quick', 2: 'Balanced', 3: 'Measured' };
  pacing?.addEventListener('input', (event) => { document.getElementById('dl-pacing-output').textContent = pacingLabels[event.target.value]; acknowledge('Pacing updated', `${pacingLabels[event.target.value]} pauses will guide the story.`); });
  const list = document.getElementById('dl-scene-list'); let dragged;
  list?.querySelectorAll('.dl-scene').forEach((scene) => {
    scene.addEventListener('dragstart', () => { dragged = scene; scene.classList.add('is-dragging'); });
    scene.addEventListener('dragend', () => { scene.classList.remove('is-dragging'); dragged = null; });
    scene.addEventListener('dragover', (event) => { event.preventDefault(); if (dragged && dragged !== scene) { const box = scene.getBoundingClientRect(); list.insertBefore(dragged, event.clientY < box.top + box.height / 2 ? scene : scene.nextSibling); acknowledge('Scene order updated', 'The repository flow will use this new sequence.'); } });
    scene.querySelector('.dl-scene-select')?.addEventListener('click', () => { list.querySelectorAll('.dl-scene').forEach((item) => item.classList.remove('is-selected')); scene.classList.add('is-selected'); acknowledge(`Selected scene ${scene.dataset.scene}`, scene.querySelector('strong').textContent); });
  });
  document.getElementById('dl-generate')?.addEventListener('click', () => { acknowledge('Outputs generated', 'Live demo, share link, and video are ready.'); window.setTimeout(() => { window.location.href = 'demo-lab-output.html'; }, 180); });
  const toast = document.getElementById('dl-output-toast');
  const showToast = (message) => { if (!toast) return; toast.textContent = message; toast.hidden = false; window.setTimeout(() => { toast.hidden = true; }, 2200); };
  document.getElementById('dl-copy-link')?.addEventListener('click', async () => { const link = 'https://screenreel.dev/play/q2-launch-demo'; try { await navigator.clipboard.writeText(link); showToast('Share link copied'); } catch { showToast(link); } });
  document.querySelector('[data-demo-id="play-live"]')?.addEventListener('click', () => showToast('Live demo playback is ready to start.'));
  document.querySelector('[data-demo-id="open-share"]')?.addEventListener('click', () => showToast('Share preview opened for this deterministic fixture.'));
  document.querySelector('[data-demo-id="download-video"]')?.addEventListener('click', () => showToast('Render download is ready in the demo fixture.'));
  const demoButton = document.getElementById('demo-button');
  if (demoButton && window.ScreenReel && !isStudioPreview) {
    window.ScreenReel.mount(demoButton, {
      projectId: 'action-showcase',
      flow: { src: 'screenreel.demo.json' },
      loop: false,
      pages: ['./', 'demo-lab.html', 'demo-lab-output.html', 'showcase-heal.html'],
    }).catch((error) => {
      console.error('[screenreel] Demo Lab failed to initialize', error);
      demoButton.disabled = true;
    });
  }
})();
