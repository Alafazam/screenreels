import { icon } from './icons.js';
import { Recorder } from './recorder.js';
import { GestureHighlighter, createOutline, describeTarget } from './target-picker.js';
import { actionSelfMs, estimateSceneSeconds, estimateSpeechMs, planPace, PACE_SKIP_TYPES } from './pacing.js';

let activeStudio;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const TOAST_MS = 2600;           // matches the projector's toast, so Studio and tour feel the same
const ROUTE_LINK_LIMIT = 20;     // links harvested from the preview: a suggestion list, not a sitemap
const NOTE_QUOTE_LIMIT = 80;     // how much of a voiceover line the Settings modal quotes back
/* Everything about a scene except its route, narration, and sequence. Ranges match save()'s
   validation, so a value the modal accepts is a value the flow can be saved with. */
const SCENE_FIELDS = [
  { key: 'title', label: 'Scene title', type: 'text' },
];
/* Labelled as what they do to playback rather than by their field names: "ready selector" and
   "settle time" only parse for someone who already knows the scene lifecycle. */
const SCENE_TIMING_FIELDS = [
  { key: 'waitFor', label: 'Wait for this element first (optional)', type: 'text' },
  { key: 'timeoutMs', label: 'Give up waiting after (ms)', type: 'number', min: 100, max: 120000 },
  { key: 'settleMs', label: 'Then pause before acting (ms)', type: 'number', min: 0, max: 30000 },
  { key: 'dwellMs', label: 'Hold after the last action (ms)', type: 'number', min: 100, max: 120000 },
];
const ACTION_ICONS = { choice: 'right', highlight: 'spark', glow: 'spark', spotlight: 'spark', callout: 'notes', flash: 'spark', reel: 'spark', reveal: 'capture', countdown: 'clock', wait: 'clock', waitFor: 'clock', scrollIntoView: 'down', scroll: 'down', click: 'right', pointer: 'right', hover: 'right', focus: 'right', goto: 'right', type: 'notes', set: 'sliders', toggle: 'sliders', lever: 'sliders', drag: 'grip', call: 'studio' };
const flowCounts = (flow) => ({ scenes: flow.scenes.length, enabled: flow.scenes.filter((scene) => scene.enabled !== false).length, actions: flow.scenes.reduce((total, scene) => total + scene.actions.length, 0) });
function formatUpdated(flow) { if (flow.readonly) return 'Standard'; try { return new Date(flow.updatedAt).toLocaleDateString('en-GB'); } catch { return '—'; } }

class Studio {
  constructor(options) { this.projector = options.projector; this.store = options.store; this.assetBase = options.assetBase; this.assetVersion = options.assetVersion; this.flowId = options.flowId; this.sceneId = options.sceneId; this.view = this.flowId ? (this.sceneId ? 'editor' : 'scenes') : 'flows'; this.dirty = false; this.failedAction = -1; this.pickerActive = false; }
  open() {
    this.host = document.createElement('div'); document.body.appendChild(this.host); this.shadow = this.host.attachShadow({ mode: 'open' }); const link = document.createElement('link'); link.rel = 'stylesheet'; const styleUrl = new URL('screenreel.css', this.assetBase); if (this.assetVersion) styleUrl.search = this.assetVersion; link.href = styleUrl.href; this.shadow.appendChild(link);
    this.shell = document.createElement('div'); this.shell.className = 'sr-studio'; this.shadow.appendChild(this.shell); this.beforeUnload = (event) => { if (this.dirty) { event.preventDefault(); event.returnValue = ''; } }; addEventListener('beforeunload', this.beforeUnload); this.keydown = (event) => this.handleKeydown(event); document.addEventListener('keydown', this.keydown, true); this.loadDraft(); this.render(); return this;
  }
  loadDraft() { const flow = this.store.getFlow(this.flowId) || this.store.activeFlow(); this.flowId = flow?.id; this.draft = flow ? clone(flow) : null; if (this.sceneId && !this.draft?.scenes.some((scene) => scene.id === this.sceneId)) this.sceneId = null; }
  close() { if (this.dirty && !confirm('Discard unsaved ScreenReel changes?')) return; this.cancelPicker(); this.disarmGestures?.(); removeEventListener('beforeunload', this.beforeUnload); document.removeEventListener('keydown', this.keydown, true); this.host.remove(); activeStudio = null; }
  head() { return `<header class="sr-studio-head"><div class="sr-studio-brand"><span class="sr-brand-ico">${icon('presentation', 18)}</span><div><span>Screen</span>Reel Studio</div></div>${this.dirty ? '<span class="sr-dirty">Unsaved changes</span>' : ''}<button data-global="ai">Copy AI context</button><button data-global="close" aria-label="Close Studio">${icon('close')} Close</button></header>`; }
  render() { this.cancelPicker(); this.disarmGestures?.(); this.shell.innerHTML = this.head() + '<main class="sr-studio-body"></main>'; this.body = this.shell.querySelector('.sr-studio-body'); if (this.view === 'flows') this.renderFlows(); else if (this.view === 'scenes') this.renderScenes(); else this.renderEditor(); this.shell.querySelector('[data-global="close"]').onclick = () => this.close(); this.shell.querySelector('[data-global="ai"]').onclick = () => this.copyAiContext(); }
  toast(message) { this.shadow.querySelector('.sr-toast-studio')?.remove(); const node = document.createElement('div'); node.className = 'sr-toast-studio'; node.textContent = message; this.shell.appendChild(node); setTimeout(() => node.remove(), TOAST_MS); }
  renderFlows() {
    const flows = this.store.allFlows(); this.body.innerHTML = `<section class="sr-page"><div class="sr-page-title"><div><h1>Demo flows</h1><p>Choose a flow to manage its scene order and talking points.</p></div><div class="sr-toolbar"><button class="sr-primary" data-new>${icon('plus')} New flow</button><button data-import>${icon('upload')} Import</button><button data-clear class="sr-danger sr-iconbtn" title="Clear local data" aria-label="Clear local data">${icon('eraser')}</button></div></div><div class="sr-panel"><table class="sr-flow-table"><thead><tr><th>Flow</th><th>Scenes</th><th>Enabled</th><th>Actions</th><th>Updated</th><th aria-hidden="true"></th></tr></thead><tbody>${flows.map((flow) => { const c = flowCounts(flow); return `<tr class="sr-flow-row" data-open="${esc(flow.id)}"><td><div class="sr-flow-name"><span class="sr-flow-ico ${flow.readonly ? 'canonical' : ''}">${icon(flow.readonly ? 'shield' : 'presentation')}</span><div><strong>${esc(flow.name)}</strong><small>${flow.readonly ? 'Immutable standard flow' : 'Saved in this browser'}</small></div></div></td><td class="sr-num">${c.scenes}</td><td class="sr-num">${c.enabled}</td><td class="sr-num">${c.actions}</td><td class="sr-muted">${esc(formatUpdated(flow))}</td><td class="sr-row-actions"><button data-duplicate="${esc(flow.id)}" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button>${flow.readonly ? '' : `<button data-rename="${esc(flow.id)}" title="Rename" aria-label="Rename">${icon('pencil')}</button><button class="sr-danger" data-delete="${esc(flow.id)}" title="Delete" aria-label="Delete">${icon('trash')}</button>`}</td></tr>`; }).join('')}</tbody></table></div><p class="sr-page-foot">Personal flows stay in this browser. The standard flow always remains available as a reset point.</p></section>`;
    this.body.querySelectorAll('[data-open]').forEach((row) => row.onclick = (event) => { if (event.target.closest('button')) return; this.flowId = row.dataset.open; this.view = 'scenes'; this.loadDraft(); this.render(); });
    this.body.querySelectorAll('[data-duplicate]').forEach((button) => button.onclick = () => { const flow = this.store.createCopy(this.store.getFlow(button.dataset.duplicate)); this.store.save(flow); this.render(); });
    this.body.querySelectorAll('[data-rename]').forEach((button) => button.onclick = () => { const flow = this.store.getFlow(button.dataset.rename); const name = prompt('Flow name', flow.name); if (name?.trim()) { flow.name = name.trim(); this.store.save(flow); this.render(); } });
    this.body.querySelectorAll('[data-delete]').forEach((button) => button.onclick = () => { if (confirm('Delete this local flow?')) { this.store.delete(button.dataset.delete); this.render(); } });
    this.body.querySelector('[data-new]').onclick = () => { const flow = this.store.createBlank(prompt('Flow name') || 'New demo flow'); this.store.save(flow); this.render(); };
    this.body.querySelector('[data-import]').onclick = () => this.importFile(); this.body.querySelector('[data-clear]').onclick = () => { if (confirm('Clear only ScreenReel data for this project?')) { this.store.clearAll(); this.store.ready().then(() => { this.flowId = null; this.render(); }); } };
  }
  ensureEditable() { if (!this.draft.readonly) return; const sceneIndex = this.draft.scenes.findIndex((scene) => scene.id === this.sceneId); this.draft = this.store.createCopy(this.draft, `My ${this.draft.name}`); this.flowId = this.draft.id; if (sceneIndex >= 0) this.sceneId = this.draft.scenes[sceneIndex].id; this.dirty = true; this.toast('Created a local copy'); }
  renderScenes() {
    if (!this.draft) return this.backToFlows();
    /* An empty flow has exactly one useful move, so Add scene carries the accent and the buttons
       that need existing scenes to mean anything stay out of the way until there are some. */
    const empty = this.draft.scenes.length === 0;
    this.body.innerHTML = `<section class="sr-page"><div class="sr-page-title"><div><button class="sr-back" data-back aria-label="Back to flows">${icon('left')}</button><h1>${esc(this.draft.name)}</h1><p>${flowCounts(this.draft).scenes} scenes · ${flowCounts(this.draft).enabled} enabled · reorder, enable, or open a scene to edit its sequence.</p></div><div class="sr-toolbar"><button data-add class="${empty ? 'sr-primary' : ''}">${icon('plus')} Add scene</button>${empty ? '' : `<button data-dup>${icon('copy')} Duplicate</button>`}<button data-variables>${icon('sliders')} Variables</button>${empty ? '' : `<button data-export>${icon('upload')} Export</button>`}${this.draft.readonly ? '' : `<button data-reset>${icon('rotate')} Reset</button>`}${empty ? '' : `<button data-play>${icon('play')} Play flow</button>`}<button data-save class="${this.dirty ? 'sr-primary sr-save-dirty' : ''}" title="Save this flow to this browser">${icon('check')} Save</button></div></div><div class="sr-panel"><table class="sr-scene-table"><thead><tr><th>Order</th><th>Scene</th><th>Talking points</th><th>Sequence</th><th>Time</th><th>Enabled</th><th aria-hidden="true"></th></tr></thead><tbody>${empty ? `<tr><td colspan="7" class="sr-empty">No scenes yet. <strong>Add scene</strong> starts one on the page you opened Studio from, and opens its settings so you can name it.</td></tr>` : ''}${this.draft.scenes.map((scene, index) => `<tr draggable="true" data-index="${index}"><td class="sr-order"><span class="sr-grip" title="Drag to reorder" aria-hidden="true">${icon('grip')}</span><span class="sr-order-num">${String(index + 1).padStart(2, '0')}</span></td><td><div class="sr-scene-name"><strong>${esc(scene.title)}</strong><small class="sr-route">${esc(scene.route)}</small></div></td><td class="sr-notes-preview">${esc(scene.talkingPoints)}</td><td><span class="sr-chip">${scene.actions.length} actions</span></td><td class="sr-muted sr-time">${estimateSceneSeconds(scene, this.draft.defaults)} sec</td><td><label class="sr-toggle"><input type="checkbox" data-enabled ${scene.enabled !== false ? 'checked' : ''}><span></span></label></td><td class="sr-row"><button data-up title="Move up" aria-label="Move up">${icon('up')}</button><button data-down title="Move down" aria-label="Move down">${icon('down')}</button><button data-edit>${icon('pencil')} Edit</button><button data-remove class="sr-danger" title="Delete scene" aria-label="Delete scene">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div></section>`;
    this.body.querySelector('[data-back]').onclick = () => this.backToFlows(); this.body.querySelector('[data-save]').onclick = () => this.save(); this.body.querySelector('[data-export]')?.addEventListener('click', () => this.exportFlow()); this.body.querySelector('[data-variables]').onclick = () => this.editVariables(); this.body.querySelector('[data-dup]')?.addEventListener('click', () => { const flow = this.store.save(this.store.createCopy(this.draft)); this.flowId = flow.id; this.sceneId = null; this.view = 'scenes'; this.dirty = false; this.loadDraft(); this.render(); }); this.body.querySelector('[data-play]')?.addEventListener('click', () => { if (!this.save()) return; this.close(); this.projector.enable(); this.projector.store.setPosition(0); this.projector.play(); });
    this.body.querySelector('[data-add]').onclick = () => { this.ensureEditable(); const scene = { id: window.ScreenReelStore.makeId('scene'), enabled: true, route: window.ScreenReelCore.normalizeRoute(this.projector.router.getRoute(), location.href) || '/', title: 'New scene', talkingPoints: '', dwellMs: 6000, actions: [] }; this.draft.scenes.push(scene); this.sceneId = scene.id; this.view = 'editor'; this.dirty = true; this.render(); this.openSceneSettings(); };
    const reset = this.body.querySelector('[data-reset]'); if (reset) reset.onclick = () => { if (!confirm('Replace this flow’s scenes with the first canonical flow?')) return; const standard = clone(this.store.standardFlows[0]); this.draft.scenes = standard.scenes; this.draft.defaults = standard.defaults; this.dirty = true; this.render(); };
    this.body.querySelectorAll('tbody tr').forEach((row) => {
      const index = Number(row.dataset.index); row.querySelector('[data-enabled]').onchange = (e) => { this.ensureEditable(); this.draft.scenes[index].enabled = e.target.checked; this.dirty = true; };
      row.querySelector('[data-edit]').onclick = () => { this.sceneId = this.draft.scenes[index].id; this.view = 'editor'; this.render(); };
      row.querySelector('[data-remove]').onclick = () => { if (!confirm('Delete this scene from the local flow?')) return; this.ensureEditable(); this.draft.scenes.splice(index, 1); this.dirty = true; this.render(); };
      row.querySelector('[data-up]').onclick = () => this.moveScene(index, index - 1); row.querySelector('[data-down]').onclick = () => this.moveScene(index, index + 1);
      row.ondragstart = () => { this.dragIndex = index; row.classList.add('dragging'); }; row.ondragend = () => row.classList.remove('dragging'); row.ondragover = (e) => e.preventDefault(); row.ondrop = () => this.moveScene(this.dragIndex, index);
    });
  }
  /* Flow-level {{variable}} declarations. v1 edits the JSON map directly (the field system has no
     repeatable-row type); names are validated so a typo can't silently never resolve. */
  editVariables() {
    const modal = this.modal(`<h2>Flow variables</h2><p class="sr-muted">Use <code>{{name}}</code> in action text, notes, values, and scene talking points. Viewers can override per link with <code>?srv_name=value</code>.</p><div class="sr-fields">${this.fieldHtml({ key: 'variables', label: 'Variables — { "name": "default" } or { "name": { "label": "…", "default": "…" } }', type: 'json' }, this.draft.variables ?? {})}</div><div class="sr-modal-actions"><button data-cancel>Cancel</button><button data-apply class="sr-primary">Apply</button></div>`);
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-apply]').onclick = () => {
      let parsed;
      try { parsed = JSON.parse(modal.querySelector('[data-key="variables"]').value || '{}'); } catch { return this.toast('Variables must be valid JSON'); }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return this.toast('Variables must be a JSON object');
      const invalid = Object.keys(parsed).find((name) => !/^[A-Za-z_]\w*$/.test(name));
      if (invalid) return this.toast(`Invalid variable name: ${invalid}`);
      this.ensureEditable(); this.draft.variables = parsed; this.dirty = true; modal.remove(); this.render();
    };
  }
  moveScene(from, to) { if (to < 0 || to >= this.draft.scenes.length || from === to) return; this.ensureEditable(); const [scene] = this.draft.scenes.splice(from, 1); this.draft.scenes.splice(to, 0, scene); this.dirty = true; this.render(); }
  scene() { return this.draft?.scenes.find((scene) => scene.id === this.sceneId); }
  previewRoute(route) { const url = new URL(route, location.href); url.searchParams.set('screenreelPreview', '1'); return `${url.pathname}${url.search}${url.hash}`; }
  renderEditor() {
    const scene = this.scene(); if (!scene) { this.view = 'scenes'; return this.render(); }
    this.body.innerHTML = `<section class="sr-page"><div class="sr-page-title"><div><button class="sr-back" data-back aria-label="Back to scenes">${icon('left')}</button><h1>${esc(scene.title)}</h1><p>${esc(this.draft.name)} · ${esc(scene.route)}</p><p class="sr-picker-banner" hidden></p></div><div class="sr-toolbar"><button data-record class="sr-record" title="Record your clicks in the preview as actions">${icon('record')} Record</button><button data-play-scene title="Play this scene in the preview">${icon('play')} Play scene</button><button data-settings title="Scene settings — route, readiness, timing">${icon('sliders')} Settings</button><button data-notes-edit title="Presenter talking points for this scene">${icon('notes')} Notes</button><button data-voice-edit title="Spoken narration for this scene">${icon('sound')} Voice</button><button data-save class="${this.dirty ? 'sr-primary sr-save-dirty' : ''}" title="Save this flow to this browser">${icon('check')} Save</button></div></div><div class="sr-editor-grid"><section class="sr-preview-panel"><div class="sr-preview-tools"><strong>Product preview</strong><input readonly value="${esc(scene.route)}"><button data-reload aria-label="Reload preview" title="Reload">${icon('rotate')}</button><small class="sr-gesture-hint">Hold <kbd>⌘</kbd> to outline · click to add a highlight</small></div><div class="sr-preview-frame-wrap"><iframe class="sr-preview-frame" src="${esc(this.previewRoute(scene.route))}" title="Scene preview"></iframe></div></section><aside class="sr-timeline"><div class="sr-timeline-head"><div><strong>Scene sequence</strong><span data-action-count>${scene.actions.length} actions · drag to reorder</span></div><button data-add-action class="sr-primary sr-add-action">${icon('plus')} Add action</button></div><div class="sr-actions">${scene.actions.length ? scene.actions.map((action, index) => this.actionRow(action, index)).join('') : `<div class="sr-empty"><p class="sr-empty-cta"><strong>Press ${icon('record', 13)} Record, then just use your app in the preview.</strong></p>Your clicks, typing, and scrolling become actions on their own.<p class="sr-empty-cta">To point at something instead, <strong>hold ⌘</strong> (Ctrl on Windows) over the preview: a box follows your pointer showing exactly what will be captured. ↑ widens it, ↓ narrows it, and a click adds the highlight — that click never reaches your app. Hold Alt for a spotlight. Or add an action by hand.</p></div>`}</div></aside></div></section>`;
    this.frame = this.body.querySelector('.sr-preview-frame'); this.body.querySelector('[data-back]').onclick = () => { this.view = 'scenes'; this.render(); }; this.body.querySelector('[data-save]').onclick = () => this.save(); this.body.querySelector('[data-reload]').onclick = () => this.frame.contentWindow.location.reload(); this.body.querySelector('[data-add-action]').onclick = () => this.openCatalog(); this.body.querySelector('[data-play-scene]').onclick = () => this.playScene(); this.body.querySelector('[data-record]').onclick = () => this.toggleRecording(); this.body.querySelector('[data-settings]').onclick = () => this.openSceneSettings(); this.body.querySelector('[data-notes-edit]').onclick = () => this.openNotes(); this.body.querySelector('[data-voice-edit]').onclick = () => this.openNarration();
    this.frame.addEventListener('load', () => this.armGestures());
    this.armGestures();
    this.body.querySelectorAll('[data-action-index]').forEach((row) => this.bindActionRow(row));
  }
  /* Scene settings live in a modal rather than a form above the preview: the editor's vertical
     space belongs to the product being demoed. Route gets a picker plus the URL it actually
     resolves to, because a wrong route is the one scene mistake that silently plays nothing. */
  openSceneSettings() {
    const scene = this.scene(); if (!scene) return;
    const routeOptions = this.routeCandidates().map((route) => `<option value="${esc(route)}">${esc(route)}</option>`).join('');
    const modal = this.modal(`<h2>Scene settings</h2><div class="sr-fields">${SCENE_FIELDS.map((spec) => this.fieldHtml(spec, scene[spec.key])).join('')}<div class="sr-field wide"><label>Route</label><div class="sr-route-row"><input data-key="route" value="${esc(scene.route)}" placeholder="/dashboard"><select data-route-pick aria-label="Known pages"><option value="">Pages…</option>${routeOptions}</select></div><small class="sr-route-resolved"></small></div></div><fieldset class="sr-fieldset"><legend>Timing</legend><p>How long this scene waits for the page before it starts acting, and how long it rests once the last action is done. Leave any of them blank to inherit the flow's defaults.</p><div class="sr-fields">${SCENE_TIMING_FIELDS.map((spec) => this.fieldHtml(spec, scene[spec.key])).join('')}</div></fieldset><div class="sr-modal-actions"><button data-cancel>Cancel</button><button data-apply class="sr-primary">Apply</button></div>`);
    const routeInput = modal.querySelector('[data-key="route"]'); const resolved = modal.querySelector('.sr-route-resolved');
    const showResolved = () => { try { resolved.textContent = new URL(routeInput.value, location.href).href; } catch { resolved.textContent = 'Not a route this browser can resolve'; } };
    routeInput.oninput = showResolved; showResolved();
    modal.querySelector('[data-route-pick]').onchange = (event) => { const picked = event.target.value; event.target.value = ''; if (!picked) return; routeInput.value = picked; showResolved(); };
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-apply]').onclick = () => {
      const route = window.ScreenReelCore.normalizeRoute(routeInput.value, location.href);
      if (!route) { try { const url = new URL(routeInput.value); this.toast(`That URL is on ${url.origin} — routes must be on this origin`); } catch { this.toast('Invalid route'); } return; }
      this.ensureEditable(); const target = this.scene();
      for (const spec of [...SCENE_FIELDS, ...SCENE_TIMING_FIELDS]) { const input = modal.querySelector(`[data-key="${spec.key}"]`); target[spec.key] = spec.type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value; }
      target.route = route;
      this.dirty = true; modal.remove(); this.render();
    };
  }
  /* Presenter notes and spoken narration each get their own button rather than living at the bottom
     of Scene settings: they are what an author actually writes and rewrites, while settings are
     mechanics you touch once. */
  openNotes() {
    const scene = this.scene(); if (!scene) return;
    const modal = this.modal(`<h2>Talking points</h2><div class="sr-fields"><div class="sr-field wide"><label>What the presenter says over this scene</label><textarea data-key="talkingPoints" placeholder="One or two lines. Shown in the presenter notes panel — and spoken aloud unless Voice overrides it.">${esc(scene.talkingPoints ?? '')}</textarea></div></div><div class="sr-modal-actions"><button data-cancel>Cancel</button><button data-apply class="sr-primary">Apply</button></div>`);
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-apply]').onclick = () => {
      this.ensureEditable(); this.scene().talkingPoints = modal.querySelector('[data-key="talkingPoints"]').value;
      this.dirty = true; modal.remove(); this.render();
    };
  }
  openNarration() {
    const scene = this.scene(); if (!scene) return;
    const modal = this.modal(`<h2>Voiceover</h2><div class="sr-fields"><div class="sr-field wide"><label>Spoken when this scene opens</label><textarea data-key="narration" placeholder="Leave empty to speak the talking points instead">${esc(scene.narration ?? '')}</textarea><div class="sr-narration-tools"><button data-narrate-preview title="Hear this narration in this browser">${icon('sound')} Preview</button><small class="sr-muted">Individual actions can carry their own lines — open an action's settings to add one.</small></div></div></div><div class="sr-modal-actions"><button data-cancel>Cancel</button><button data-apply class="sr-primary">Apply</button></div>`);
    const narrationInput = modal.querySelector('[data-key="narration"]');
    /* Preview speaks through the same engine the live tour uses, so what the author hears here is
       what a viewer hears. A second click stops it rather than queueing a second reading. */
    modal.querySelector('[data-narrate-preview]').onclick = () => {
      const narrator = window.__screenreelNarrator;
      if (!narrator?.available()) return this.toast('This browser has no speech engine');
      if (narrator.speaking()) { narrator.cancel(); return; }
      narrator.speak(narrationInput.value);
    };
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-apply]').onclick = () => {
      this.ensureEditable(); const target = this.scene();
      target.narration = narrationInput.value;
      if (!target.narration.trim()) delete target.narration;
      this.dirty = true; modal.remove(); this.render();
    };
  }
  /* An action's own line, edited from the row it belongs to. Deliberately its own modal rather than a
     field in the action's Settings — see editAction — and it is the only place that writes the field,
     so the pace refit below can be the only one too. */
  editActionNarration(index) {
    const action = this.scene().actions[index]; if (action.locked) return this.toast('Unknown imported actions are preserved but locked');
    const definition = window.ScreenReelCore.definitionForAction(action); if (!definition) return;
    const modal = this.modal(`<h2>Voiceover · ${esc(definition.label)}</h2><div class="sr-fields"><div class="sr-field wide"><label>Spoken while this action runs</label><textarea data-key="narration" placeholder="One sentence, spoken as this action runs. The next action's line replaces it.">${esc(action.narration ?? '')}</textarea><div class="sr-narration-tools"><button data-narrate-preview title="Hear this line in this browser">${icon('sound')} Preview</button><small class="sr-pace-hint"></small></div></div></div><div class="sr-modal-actions"><button data-cancel>Cancel</button><button data-apply class="sr-primary">Apply</button></div>`);
    const narrationInput = modal.querySelector('[data-key="narration"]');
    const hint = modal.querySelector('.sr-pace-hint');
    /* Says what the line will cost before Apply commits it, because the fix for a line that does not
       fit is to shorten it — and that is only obvious while it is still on screen. */
    const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
    const showHint = () => {
      const text = narrationInput.value.trim();
      if (!text) return void (hint.textContent = 'No line — this action stays silent.');
      const speechMs = estimateSpeechMs(text);
      if (!speechMs) return void (hint.textContent = 'This browser cannot estimate speech length — timing stays as you set it.');
      if (PACE_SKIP_TYPES.has(action.type)) return void (hint.textContent = `Estimated ${seconds(speechMs)} — this action's length is decided at play time, so the line may be cut short.`);
      const plan = planPace(action, definition, speechMs);
      if (plan.capped) return void (hint.textContent = `Estimated ${seconds(speechMs)} — longer than one action can hold. Split it across two actions.`);
      const paced = { ...action, [plan.field]: plan[plan.field] };
      hint.textContent = `Estimated ${seconds(speechMs)} — this ${action.type} will hold ${seconds(actionSelfMs(paced, definition) + Number(paced.afterMs || 0))} so the line finishes.`;
    };
    narrationInput.oninput = showHint; showHint();
    /* Preview speaks through the same engine the live tour uses, so what the author hears here is
       what a viewer hears. A second click stops it rather than queueing a second reading. */
    modal.querySelector('[data-narrate-preview]').onclick = () => {
      const narrator = window.__screenreelNarrator;
      if (!narrator?.available()) return this.toast('This browser has no speech engine');
      if (narrator.speaking()) { narrator.cancel(); return; }
      narrator.speak(narrationInput.value);
    };
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-apply]').onclick = () => {
      this.ensureEditable(); const target = this.scene().actions[index];
      target.narration = narrationInput.value;
      if (!String(target.narration).trim()) delete target.narration;
      const plan = this.applyPace(target, definition);
      this.dirty = true; modal.remove(); this.render(); // render() last: it recreates the preview iframe
      if (plan.addedMs) this.toast(`Added ${seconds(plan.addedMs)} of ${plan.field} so the line finishes`);
    };
  }
  /* Writes planPace's patch onto an action. The only mutator of `action.pace`, so the recorded
     baseline can never disagree with the field it describes. */
  applyPace(action, definition) {
    const plan = planPace(action, definition, estimateSpeechMs(window.ScreenReelCore.actionNarration(action)));
    action[plan.field] = plan[plan.field];
    if (plan.pace) action.pace = plan.pace; else delete action.pace;
    return plan;
  }
  /* Routes worth offering as a scene's route, deduped by their normalized form: every route the
     saved flows already use, the page Studio was opened from, links the preview itself offers, and
     anything the host declared through the `pages` mount option. Suggestions only — the input
     stays free text, and Apply is what validates. */
  routeCandidates() {
    const seen = new Set(); const routes = [];
    const add = (value) => { const route = window.ScreenReelCore.normalizeRoute(value, location.href); if (!route || seen.has(route)) return false; seen.add(route); routes.push(route); return true; };
    for (const flow of this.store.allFlows()) for (const scene of flow.scenes || []) add(scene.route);
    add(this.projector.router?.getRoute?.() ?? location.href);
    try {
      const frameDoc = this.frame?.contentDocument; let found = 0;
      for (const link of frameDoc ? frameDoc.querySelectorAll('a[href]') : []) { if (found >= ROUTE_LINK_LIMIT) break; if (add(link.href)) found += 1; }
    } catch { /* a preview that navigated cross-origin simply contributes nothing */ }
    for (const page of this.projector.options.pages || []) add(page);
    return routes;
  }
  /* Every action row is bound here — the full render() and the recorder's incremental append both
     go through it — so drag-reorder lives here rather than in the render template. */
  bindActionRow(row) { const index = Number(row.dataset.actionIndex); row.querySelector('[data-action-voice]').onclick = () => this.editActionNarration(index); row.querySelector('[data-action-edit]').onclick = () => this.editAction(index); row.querySelector('[data-action-up]').onclick = () => this.moveAction(index, index - 1); row.querySelector('[data-action-down]').onclick = () => this.moveAction(index, index + 1); row.querySelector('[data-action-delete]').onclick = () => { this.ensureEditable(); this.scene().actions.splice(index, 1); this.dirty = true; this.render(); };
    row.ondragstart = () => { this.actionDragIndex = index; row.classList.add('dragging'); }; row.ondragend = () => row.classList.remove('dragging'); row.ondragover = (event) => event.preventDefault(); row.ondrop = () => this.moveAction(this.actionDragIndex, index);
  }
  /* Hold ⌘/Ctrl (highlight) or Alt (spotlight) over the preview and a box follows the pointer
     showing exactly what a click would capture — armed whenever the preview is loaded, not only
     mid-recording. Having to press Record first just to grab an element, with no preview of what
     the click would resolve to, was the most confusing thing about authoring a scene.

     ONE state machine serves both cases and only the commit differs: mid-take it goes through the
     Recorder's coalescer so the take stays one sequence (idle gaps still become afterMs, a typing
     burst still finalizes first), and otherwise it appends incrementally with no render() so the
     preview's own page state survives. It gets its OWN teardown slot rather than sharing
     this.cancelPicker: startPicker's cleanup() resets that slot to a no-op, which would orphan
     these listeners on the app's document with no handle left to remove them. */
  armGestures() {
    this.disarmGestures?.();
    if (!this.frame?.contentDocument) return;
    const gesture = new GestureHighlighter({
      frame: this.frame, core: window.ScreenReelCore, shell: this.shell,
      isPickerActive: () => this.pickerActive,
      onCommit: ({ annotation, selector, fingerprint }) => {
        this.ensureEditable(); // safe mid-take: it does not render()
        if (this.recorder?.active) this.recorder.annotate({ annotation, selector, fingerprint });
        else this.applyRecordedOp({ op: 'append', action: { type: annotation, definitionId: annotation, selector, fingerprint, ...clone(window.ScreenReelCore.getDefinition(annotation)?.defaults || {}) } });
        this.toast(`Added ${annotation} · ${selector}`);
      },
      onReject: (message) => this.toast(message),
    });
    if (!gesture.attach()) return;
    this.gesture = gesture;
    this.disarmGestures = () => { gesture.destroy(); this.gesture = null; this.disarmGestures = null; };
  }
  /* Record-by-doing. The recorder's teardown is installed into this.cancelPicker — the same slot
     the selector picker uses — so any destructive render() (row edits, back, save, close) stops
     recording cleanly before the preview iframe is torn down. The first press explains what is
     about to be captured; after that it just records. */
  toggleRecording() {
    if (this.recorder?.active) { this.cancelPicker(); return; }
    if (!this.frame?.contentDocument) return this.toast('Preview is not available for recording');
    this.cancelPicker();
    /* ensureEditable() belongs to startRecording, not here: cancelling the primer must not leave a
       local copy of a standard flow behind. */
    if (this.store.recordPrimerSeen()) this.startRecording(); else this.openRecordPrimer();
  }
  openRecordPrimer() {
    const modal = this.modal(`<h2>What recording captures</h2><ul class="sr-primer-list"><li>Every click on a button, link, or control.</li><li>A burst of typing becomes <strong>one</strong> <code>type</code> action, at the speed you actually typed.</li><li>Selects, checkboxes, and sliders become <code>set</code>, <code>toggle</code>, and <code>lever</code>.</li><li>A scroll becomes <strong>one</strong> <code>scroll</code> per burst, as a percentage of the viewport.</li><li>Pauses become <code>afterMs</code> on the previous action, so replay keeps your rhythm.</li><li>A click that navigates becomes <code>goto</code>, and recording continues on the new page.</li><li>Password fields are never recorded — nor is anything your app dispatches itself.</li></ul><p class="sr-primer-keys">While recording: ⌘/Ctrl+click highlights · Alt+click spotlights · Esc stops.</p><label class="sr-primer-soon"><input type="checkbox" data-record-voice disabled> Record my narration while I go<em>Coming soon</em></label><div class="sr-modal-actions"><label class="sr-primer-skip"><input type="checkbox" data-record-skip> Don’t show this again</label><button data-cancel>Cancel</button><button data-record-start class="sr-primary">${icon('record')} Start recording</button></div>`);
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-record-start]').onclick = () => {
      if (modal.querySelector('[data-record-skip]').checked) this.store.setRecordPrimerSeen(true);
      modal.remove(); this.startRecording();
    };
  }
  startRecording() {
    // Re-checked: the author can reload or navigate the preview while the primer is open.
    if (!this.frame?.contentDocument) return this.toast('Preview is not available for recording');
    this.ensureEditable();
    const button = this.body.querySelector('[data-record]');
    const recorder = new Recorder({
      frame: this.frame, core: window.ScreenReelCore, banner: this.body.querySelector('.sr-picker-banner'),
      route: this.scene().route,
      /* Both own an Escape listener on the frame window in capture phase, and their order is
         re-derived on every frame load — so the recorder asks rather than racing. */
      shouldStopOnEscape: () => !this.gesture?.isArmed(),
      onOp: (op) => this.applyRecordedOp(op),
      onStop: (reason) => {
        this.recorder = null; this.cancelPicker = () => {};
        const node = this.body?.querySelector('[data-record]');
        if (node) { node.classList.remove('recording'); node.innerHTML = `${icon('record')} Record`; }
        if (reason) this.toast(reason);
      },
    });
    if (!recorder.start()) return this.toast('Preview is not available for recording');
    this.recorder = recorder;
    this.cancelPicker = () => recorder.stop();
    if (button) { button.classList.add('recording'); button.innerHTML = `${icon('record')} Stop`; }
  }
  /* Applies recorder ops without render(): a re-render would recreate the preview iframe, losing
     page state and the recorder's listeners mid-session. Rows are appended incrementally instead. */
  applyRecordedOp(op) {
    const scene = this.scene(); if (!scene) return;
    if (op.op === 'append') {
      const action = { id: window.ScreenReelStore.makeId('action'), ...op.action };
      scene.actions.push(action); this.dirty = true; this.markDirty();
      const list = this.body?.querySelector('.sr-actions'); if (!list) return;
      list.querySelector('.sr-empty')?.remove();
      list.insertAdjacentHTML('beforeend', this.actionRow(action, scene.actions.length - 1));
      this.bindActionRow(list.lastElementChild);
      const count = this.body.querySelector('[data-action-count]'); if (count) count.textContent = `${scene.actions.length} actions · drag to reorder`;
    } else if (op.op === 'patchLast') {
      const last = scene.actions[scene.actions.length - 1]; if (!last) return;
      Object.assign(last, op.patch); this.dirty = true; this.markDirty();
    } else if (op.op === 'replaceLast') {
      const index = scene.actions.length - 1; if (index < 0) return;
      scene.actions[index] = { id: scene.actions[index].id, ...op.action }; this.dirty = true; this.markDirty();
      const row = this.body?.querySelector(`[data-action-index="${index}"]`); if (!row) return;
      row.outerHTML = this.actionRow(scene.actions[index], index);
      this.bindActionRow(this.body.querySelector(`[data-action-index="${index}"]`));
    }
  }
  /* head() only renders the unsaved-changes badge during a full render(); recording avoids those. */
  markDirty() { this.body?.querySelector('[data-save]')?.classList.add('sr-primary', 'sr-save-dirty'); if (this.shell.querySelector('.sr-dirty')) return; this.shell.querySelector('[data-global="ai"]')?.insertAdjacentHTML('beforebegin', '<span class="sr-dirty">Unsaved changes</span>'); }
  actionRow(action, index) { const definition = window.ScreenReelCore.definitionForAction(action); const hasLine = !!String(action.narration || '').trim(); const voice = hasLine ? `<span class="sr-action-voice" title="Has narration">${icon('sound', 13)}</span>` : ''; return `<article class="sr-action ${this.failedAction === index ? 'failed' : ''}" draggable="true" data-action-index="${index}"><span class="sr-action-index">${index + 1}</span><span class="sr-action-ico">${icon(ACTION_ICONS[action.type] || 'spark')}</span><div class="sr-action-body"><strong>${esc(definition?.label || action.type)}</strong><small>${voice}${esc(action.selector || action.url || action.fn || `${action.ms || ''} ms`)}</small></div><div class="sr-action-btns"><button data-action-voice class="${hasLine ? 'has-line' : ''}" title="Voiceover" aria-label="Voiceover">${icon('sound')}</button><button data-action-edit title="Settings" aria-label="Settings">${icon('sliders')}</button><button data-action-up title="Move up" aria-label="Move up">${icon('up')}</button><button data-action-down title="Move down" aria-label="Move down">${icon('down')}</button><button data-action-delete class="sr-danger" title="Remove action" aria-label="Remove">${icon('close')}</button></div></article>`; }
  moveAction(from, to) { if (from == null || from === to || to < 0 || to >= this.scene().actions.length) return; this.ensureEditable(); const [action] = this.scene().actions.splice(from, 1); this.scene().actions.splice(to, 0, action); this.dirty = true; this.render(); }
  openCatalog() {
    const categories = [...new Set(window.ScreenReelCore.definitions.map((item) => item.category))]; const modal = this.modal(`<h2>Add action</h2><div class="sr-field"><label>Search actions</label><input data-search placeholder="Highlight, click, wait…"></div><div class="sr-catalog">${categories.flatMap((category) => window.ScreenReelCore.definitions.filter((item) => item.category === category).map((item) => `<button data-definition="${item.id}"><strong>${esc(item.label)}</strong><span>${esc(category)} · ${esc(item.picker)}</span></button>`)).join('')}</div><h2>Recipes</h2><div class="sr-catalog">${window.ScreenReelCore.recipes.map((item) => `<button data-recipe="${item.id}"><strong>${esc(item.label)}</strong><span>Inserts editable primitive actions</span></button>`).join('')}</div>`);
    const filter = () => modal.querySelectorAll('.sr-catalog button').forEach((button) => button.hidden = !button.textContent.toLowerCase().includes(modal.querySelector('[data-search]').value.toLowerCase())); modal.querySelector('[data-search]').oninput = filter;
    modal.querySelectorAll('[data-definition]').forEach((button) => button.onclick = () => { const definition = window.ScreenReelCore.getDefinition(button.dataset.definition); modal.remove(); const action = { id: window.ScreenReelStore.makeId('action'), type: definition.type, definitionId: definition.id, ...clone(definition.defaults) }; definition.picker === 'none' ? this.addActions([action]) : this.startPicker(definition.picker, (selection) => this.addActions([{ ...action, ...selection }])); });
    modal.querySelectorAll('[data-recipe]').forEach((button) => button.onclick = () => { const recipe = window.ScreenReelCore.recipes.find((item) => item.id === button.dataset.recipe); modal.remove(); recipe.picker === 'none' ? this.addActions(recipe.build({})) : this.startPicker(recipe.picker, (selection) => this.addActions(recipe.build(selection))); });
  }
  addActions(actions) { this.ensureEditable(); this.scene().actions.push(...actions.map((action) => ({ id: window.ScreenReelStore.makeId('action'), ...action }))); this.dirty = true; this.render(); }
  /* The catalog's target picker, built on the same outline the ⌘-hold gesture uses — so the match
     count is visible BEFORE the click rather than toasted after it, which is when an ambiguous
     selector actually matters (save() refuses it). */
  startPicker(policy, done) {
    const frameDoc = this.frame?.contentDocument; if (!frameDoc) return this.toast('Preview is not available for picking'); const banner = this.body.querySelector('.sr-picker-banner'); banner.textContent = 'Pick a target · ↑ parent · ↓ child · Esc cancels'; banner.hidden = false;
    let phase = 0; let target = null; let descriptor = null; let sourceSelector = null; let sourceFingerprint = null; const stack = [];
    this.pickerActive = true; // a flag, not a disarm/re-arm of the gesture: a flag cannot lose a listener
    const outline = createOutline(frameDoc);
    const phasePolicy = () => policy === 'source-destination' ? (phase ? 'visual' : 'interactive') : policy;
    const forget = () => { target = null; descriptor = null; stack.length = 0; outline.clear(); };
    const place = (el) => { target = el; descriptor = describeTarget(el, phasePolicy(), window.ScreenReelCore, frameDoc, { mode: phase ? 'destination' : (policy === 'collection' ? 'collection' : 'target'), depth: stack.length }); outline.place(el, descriptor); };
    /* An unresolvable hover has to FORGET the previous target: leaving the outline where it was let
       a click commit an element the pointer had already left. */
    const hover = (e) => { const resolved = window.ScreenReelCore.resolvePickerTarget(e.target, phasePolicy(), frameDoc); if (resolved === target) return; if (resolved) { stack.length = 0; place(resolved); } else forget(); };
    const click = (e) => {
      e.preventDefault(); e.stopPropagation(); if (!target) return;
      if (!descriptor?.selector) return this.toast('No stable selector for that element — try its container');
      const { selector, tag, count, fingerprint } = descriptor;
      if (policy === 'source-destination' && phase === 0) {
        sourceSelector = selector; sourceFingerprint = fingerprint; phase = 1;
        /* Clearing the carried-over target is what stops two clicks with no mousemove between them
           from making the destination the source (toSelector === selector, a drag to nowhere). */
        forget(); banner.textContent = 'Now pick the destination · Esc cancels'; return;
      }
      cleanup();
      /* The source's fingerprint travels with a drag so `flow doctor` can repair its selector the
         same way it repairs every other stored target. */
      done(policy === 'source-destination' ? { selector: sourceSelector, fingerprint: sourceFingerprint, toSelector: selector } : { selector, fingerprint });
      this.toast(`${tag} selected · ${count} match${count === 1 ? '' : 'es'}`);
    };
    const key = (e) => { if (e.key === 'Escape') cleanup(); else if (e.key === 'ArrowUp' && target?.parentElement && target.parentElement !== frameDoc.body) { e.preventDefault(); stack.push(target); place(target.parentElement); } else if (e.key === 'ArrowDown' && stack.length) { e.preventDefault(); place(stack.pop()); } };
    const cleanup = () => { frameDoc.removeEventListener('mousemove', hover, true); frameDoc.removeEventListener('click', click, true); frameDoc.defaultView.removeEventListener('keydown', key, true); outline.remove(); banner.hidden = true; this.pickerActive = false; this.cancelPicker = () => {}; };
    frameDoc.addEventListener('mousemove', hover, true); frameDoc.addEventListener('click', click, true); frameDoc.defaultView.addEventListener('keydown', key, true); this.cancelPicker = cleanup;
  }
  cancelPicker() {}
  editAction(index) {
    const action = this.scene().actions[index]; if (action.locked) return this.toast('Unknown imported actions are preserved but locked'); const definition = window.ScreenReelCore.definitionForAction(action); if (!definition) return;
    const specs = [...(definition.picker !== 'none' ? [{ key: 'selector', label: 'Target selector', type: 'text' }] : []), ...(definition.fields || []), { key: 'afterMs', label: 'Delay after action (ms)', type: 'number', min: 0, max: 30000 }];
    /* Narration is deliberately NOT a field here. Two editors for one string means this modal's
       Apply silently clobbers a line just written in the Voiceover modal, and the delete-if-blank
       plus the pace refit would have to exist in both. Discovery is the row's speaker button. */
    const line = String(action.narration ?? '').trim();
    const note = `<p class="sr-modal-note">${icon('sound', 13)}${line ? `Voiceover: “${esc(line.length > NOTE_QUOTE_LIMIT ? `${line.slice(0, NOTE_QUOTE_LIMIT - 1)}…` : line)}” — edit it from this action’s speaker button.` : 'No voiceover. Add one from this action’s speaker button.'}</p>`;
    const modal = this.modal(`<h2>${esc(definition.label)}</h2>${note}<div class="sr-fields">${specs.map((spec) => this.fieldHtml(spec, action[spec.key])).join('')}</div><div class="sr-modal-actions"><button data-cancel>Cancel</button><button data-apply class="sr-primary">Apply</button></div>`);
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-apply]').onclick = () => {
      /* Read and parse every field BEFORE writing any of them: a bad JSON field used to skip
         itself silently, leaving the action half-updated with no word to the author. */
      const values = [];
      for (const spec of specs) {
        const input = modal.querySelector(`[data-key="${spec.key}"]`);
        let value = spec.type === 'checkbox' ? input.checked : spec.type === 'number' ? Number(input.value) : input.value;
        if (spec.type === 'json') { try { value = JSON.parse(input.value); } catch { return this.toast(`Invalid JSON in ${spec.label}`); } }
        values.push([spec.key, value]);
      }
      this.ensureEditable(); const target = this.scene().actions[index];
      /* An explicit edit to the field the pacer stretched makes that number the new baseline: a hold
         the author deliberately set must never be clawed back on the next refit. */
      const pacedField = target.pace?.field;
      const editedPacedField = values.find(([key]) => key === pacedField);
      if (editedPacedField && Number(editedPacedField[1]) !== Number(target[pacedField])) delete target.pace;
      for (const [key, value] of values) target[key] = value;
      // A silent action carries no narration key at all, so manifests stay as small as they were.
      if (!target.narration || !String(target.narration).trim()) delete target.narration;
      this.applyPace(target, definition); // a timing edit re-fits the line around the new number
      this.dirty = true; modal.remove(); this.render();
    };
  }
  fieldHtml(spec, value) { if (spec.type === 'checkbox') return `<label class="sr-field"><span>${esc(spec.label)}</span><input data-key="${spec.key}" type="checkbox" ${value ? 'checked' : ''}></label>`; if (spec.type === 'select') return `<label class="sr-field"><span>${esc(spec.label)}</span><select data-key="${spec.key}">${spec.options.map((option) => `<option${option === value ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`; if (spec.type === 'textarea' || spec.type === 'json') return `<label class="sr-field wide"><span>${esc(spec.label)}</span><textarea data-key="${spec.key}">${esc(spec.type === 'json' ? JSON.stringify(value ?? []) : value ?? '')}</textarea></label>`; return `<label class="sr-field"><span>${esc(spec.label)}</span><input data-key="${spec.key}" type="${spec.type === 'number' ? 'number' : 'text'}" value="${esc(value ?? '')}" ${spec.min != null ? `min="${spec.min}"` : ''} ${spec.max != null ? `max="${spec.max}"` : ''}></label>`; }
  /* Modals close on backdrop click and on Esc (handleKeydown owns the key, so nesting works), and
     hand focus to their first field so a keyboard author never has to reach for the mouse. */
  modal(html) { const backdrop = document.createElement('div'); backdrop.className = 'sr-modal-backdrop'; backdrop.innerHTML = `<div class="sr-modal">${html}</div>`; this.shell.appendChild(backdrop); backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); }; const first = backdrop.querySelector('input,textarea,select'); if (first) requestAnimationFrame(() => first.focus()); return backdrop; }
  /* Studio-wide keys. Esc closes the topmost modal — the last backdrop appended is the one on top.
     Cmd/Ctrl+S saves from the editor, where an author's muscle memory already expects it. */
  handleKeydown(event) {
    const backdrops = this.shell.querySelectorAll('.sr-modal-backdrop');
    if (event.key === 'Escape' && backdrops.length) { event.preventDefault(); backdrops[backdrops.length - 1].remove(); return; }
    if (String(event.key || '').toLowerCase() === 's' && (event.metaKey || event.ctrlKey) && !backdrops.length && this.view === 'editor') { event.preventDefault(); this.save(); }
  }
  async playScene() {
    const win = this.frame?.contentWindow; const doc = this.frame?.contentDocument; const scene = this.scene();
    if (!doc) return this.toast('Preview is unavailable');
    this.failedAction = -1;
    if (scene.waitFor) {
      const ready = await window.ScreenReelCore.waitFor(doc, scene.waitFor, 'visible', scene.timeoutMs ?? 8000);
      if (!ready) return this.toast(`Ready selector timed out: ${scene.waitFor}`);
    }
    if (scene.settleMs) await window.ScreenReelCore.sleep(scene.settleMs);
    for (let index = 0; index < scene.actions.length; index++) {
      const result = await window.ScreenReelCore.runAction(scene.actions[index], { document: doc, window: win, variables: window.ScreenReelCore.variableDefaults(this.draft?.variables), narrateAction: (text) => window.__screenreelNarrator?.speak(text), navigate: (route) => { this.frame.src = this.previewRoute(route); } });
      if (!result.ok) { this.failedAction = index; this.toast(`Action ${index + 1} failed`); this.render(); return; }
      if (result.jumpTo) { this.toast(`Choice would jump to "${result.jumpTo}" — single-scene preview stops here`); return; }
      if (result.navigated) return;
    }
    this.toast('Scene completed');
  }
  save() {
    if (this.draft.readonly) { this.toast('Edit a scene first to create a local copy'); return false; }
    const errors = [];
    for (const scene of this.draft.scenes) {
      if (!window.ScreenReelCore.normalizeRoute(scene.route, location.href)) errors.push(`${scene.title}: invalid local route`);
      if (scene.dwellMs != null && (!Number.isFinite(Number(scene.dwellMs)) || Number(scene.dwellMs) < 100 || Number(scene.dwellMs) > 120000)) errors.push(`${scene.title}: invalid scene time`);
      if (scene.timeoutMs != null && (!Number.isFinite(Number(scene.timeoutMs)) || Number(scene.timeoutMs) < 100 || Number(scene.timeoutMs) > 120000)) errors.push(`${scene.title}: invalid ready timeout`);
      if (scene.settleMs != null && (!Number.isFinite(Number(scene.settleMs)) || Number(scene.settleMs) < 0 || Number(scene.settleMs) > 30000)) errors.push(`${scene.title}: invalid settle time`);
      if (scene.id === this.sceneId) for (const action of scene.actions) if (!action.locked) errors.push(...window.ScreenReelCore.validate(action, this.frame?.contentDocument, location.href).map((message) => `${scene.title}: ${message}`));
    }
    errors.push(...window.ScreenReelCore.validateFlowGraph(this.draft));
    if (errors.length) { this.toast(errors[0]); return false; }
    this.draft = this.store.save(this.draft); this.flowId = this.draft.id; this.dirty = false; this.toast('Saved locally'); this.render(); return true;
  }
  exportFlow() { const blob = new Blob([JSON.stringify(this.store.export(this.draft), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${this.draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.screenreel.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); }
  importFile() { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = async () => { try { const flow = this.store.import(JSON.parse(await input.files[0].text())); this.flowId = flow.id; this.view = 'scenes'; this.loadDraft(); this.render(); } catch (error) { this.toast(error.message); } }; input.click(); }
  async copyAiContext() { const scene = this.scene(); let targets = []; try { targets = this.frame?.contentDocument ? window.ScreenReelCore.inspectDocument(this.frame.contentDocument) : []; } catch {} const payload = { schemaVersion: 1, projectId: this.store.projectId, flow: this.draft ? { id: this.draft.id, name: this.draft.name } : null, scene: scene || null, stableTargets: targets, validation: scene ? scene.actions.map((action, index) => ({ index, actionId: action.id, errors: action.locked ? [] : window.ScreenReelCore.validate(action, this.frame?.contentDocument, location.href) })) : [] }; const text = JSON.stringify(payload, null, 2); try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); } this.toast('AI context copied'); }
  backToFlows() { if (this.dirty && !confirm('Discard unsaved ScreenReel changes?')) return; this.view = 'flows'; this.flowId = null; this.sceneId = null; this.draft = null; this.dirty = false; this.render(); }
}

export function openStudio(options) { if (activeStudio) return activeStudio; activeStudio = new Studio(options).open(); return activeStudio; }
