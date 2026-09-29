import { icon } from './icons.js';
import { createAnalytics } from './analytics.js';

const instances = new Set();
const functions = new Map();
const TOAST_MS = 2600;
const PILL_INTRO_MS = 1100;
const VARIABLE_PARAM_PREFIX = 'srv_';
const DEFAULT_DWELL_MS = 3000;         // rest after a scene when neither it nor its flow sets dwellMs
const TRIGGER_ICON_PX = 18;
/* 'auto' advances after each scene's dwell; 'guided' holds on the finished scene until the
   viewer presses Next. */
const ADVANCE_MODES = ['auto', 'guided'];
const DEFAULT_ADVANCE_MODE = 'auto';
/* In a guided scene, a final action of one of these types stays on screen until the viewer moves on. */
const PERSISTABLE_TYPES = new Set(['highlight', 'glow', 'spotlight', 'callout']);
const CALLOUT_LABELS = { back: 'Back', next: 'Next', finish: 'Finish' };
/* Guided-tour keys, the ones a slide deck uses. */
const GUIDED_KEYS = { ArrowRight: 'next', Enter: 'next', ArrowLeft: 'prev', Escape: 'exit' };
const HOST_CONTROL_SELECTOR = 'input, textarea, select, button, a, [contenteditable]';
let publicApi;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const event = (name, detail) => window.dispatchEvent(new CustomEvent(`screenreel:${name}`, { detail }));

function defaultRouter() {
  return {
    getRoute: () => `${location.pathname}${location.search}${location.hash}`,
    navigate: (route) => { location.href = route; },
    subscribe: (listener) => { addEventListener('popstate', listener); addEventListener('hashchange', listener); return () => { removeEventListener('popstate', listener); removeEventListener('hashchange', listener); }; },
  };
}

class Projector {
  constructor(target, options, assetBase, assetVersion) {
    this.target = target; this.options = { activationQueryParam: 'demo', notesMode: 'reserve', loop: true, strict: false, timeScale: 1, cursor: 'dot', narration: true, ...options }; this.assetBase = options.assetBase || assetBase; this.assetVersion = assetVersion;
    this.usesDefaultNavigation = !options.router?.navigate; this.router = { ...defaultRouter(), ...(options.router || {}) }; this.controller = null; this.timer = null; this.playGeneration = 0; this.originalPadding = null; this.rootHost = null; this.shadow = null;
    this.retained = []; this.runningScene = null; this.leaving = Promise.resolve();
    this.store = new window.ScreenReelStore.Store({ projectId: options.projectId, flow: options.flow, baseHref: location.href, legacyStorage: options.legacyStorage });
  }
  /* Precedence: the scene's own `advance`, then the mount option, then the flow's
     `defaults.advance`. The mount option beats the flow so one flow can run guided inside the
     product and auto on a share link; a scene can still opt out either way. An unknown value warns
     and falls back to auto. */
  advanceMode(scene = this.current().scene) {
    const mode = scene?.advance ?? this.options.advance ?? this.store.activeFlow()?.defaults?.advance ?? DEFAULT_ADVANCE_MODE;
    if (ADVANCE_MODES.includes(mode)) return mode;
    console.warn(`[screenreel] Unknown advance mode "${mode}"; expected ${ADVANCE_MODES.join(' or ')}`);
    return DEFAULT_ADVANCE_MODE;
  }
  assetUrl(name) { const url = new URL(name, this.assetBase); if (this.assetVersion) url.search = this.assetVersion; return url.href; }
  /* Shared agent cursor, configured to this projector's glyph. Null when the host opted out. */
  cursor() {
    if (this.options.cursor === false) return null;
    const cursor = window.__screenreelCursor; if (!cursor) return null;
    const config = { glyph: this.options.cursor === true ? 'dot' : this.options.cursor };
    if (this.options.cursorMotion) config.motion = this.options.cursorMotion;
    return cursor.configure(config);
  }
  /* Live narrator, or null when the host opted out, the browser has no speech engine, or the
     viewer muted it. Every call site treats null as "stay silent", so narration is additive. */
  narrator() {
    if (this.options.narration === false || this.store.muted()) return null;
    const narrator = window.__screenreelNarrator;
    if (!narrator?.available()) return null;
    return narrator.configure(this.options.narration === true ? {} : this.options.narration);
  }
  /* Speak a scene's own line. Uses the interpolated text, so a personalized share link is heard
     saying the prospect's name and not "{{company}}". Silent scenes are a no-op. Per-action lines
     are spoken by the runtime as those actions run (see narrateAction in play()), so this
     deliberately takes the scene line only — the full transcript would say them twice. */
  async narrate(scene) {
    const narrator = this.narrator(); if (!narrator) return;
    const script = this.displayText(window.ScreenReelCore.sceneNarration(scene));
    if (!script) return;
    const { spoke, reason } = await narrator.speak(script);
    // Autoplay policy blocks audio until the viewer interacts. Say so once rather than leaving
    // them to wonder why a demo that advertises narration is silent.
    if (!spoke && reason === 'blocked' && !this.narrationBlocked) { this.narrationBlocked = true; this.toast('Tap the speaker to turn on narration'); this.render(); }
    if (spoke) this.narrationBlocked = false;
  }
  async init() {
    await this.store.ready(); window.ScreenReelCore.setTimeScale(this.options.timeScale); this.analytics = createAnalytics({ store: this.store, options: this.options.analytics || {} }); this.parseActivation(); this.bindTarget(); this.unsubscribe = this.router.subscribe?.(() => this.render());
    // drop_off means "left the page while playing" — pagehide covers navigation/close, the
    // visibility change covers tab switches; only the first per session fires unless playback resumes.
    this.dropOffHandler = () => { if (this.store.playing() && !this.dropOffSent) { this.dropOffSent = true; this.analytics.emit('drop_off'); } };
    this.visibilityHandler = () => { if (document.visibilityState === 'hidden') this.dropOffHandler(); else if (this.store.playing()) this.dropOffSent = false; };
    addEventListener('pagehide', this.dropOffHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    if (this.store.enabled() && !new URLSearchParams(location.search).has('screenreelPreview')) { this.enable(false); if (this.store.playing()) queueMicrotask(() => this.play()); } instances.add(this); event('ready', { projectId: this.store.projectId }); return this;
  }
  bindTarget() {
    this.clickHandler = () => this.store.enabled() ? this.disable('user') : this.enable(); this.target.addEventListener('click', this.clickHandler); this.target.setAttribute('aria-pressed', String(this.store.enabled()));
  }
  parseActivation() {
    const params = new URLSearchParams(location.search);
    const value = params.get(this.options.activationQueryParam);
    if (value === '1') this.store.setEnabled(true); if (value === '0') { this.store.setEnabled(false); this.store.clearRun(); }
    // Share mode: ?demo=play arms enabled+share+playing from scene 0, and the existing
    // "resume playback after navigation" path in init() auto-plays it — no new play logic.
    if (value === 'play' && !this.store.share()) { this.store.setEnabled(true); this.store.setShare(true); this.store.setPosition(0); this.store.setPlaying(true); }
    // Share-link personalization: ?srv_company=Acme feeds {{company}}. Captured once into the
    // session so it survives cross-route navigation; fresh params override the stored copy.
    const fromUrl = {};
    for (const [key, raw] of params) if (key.startsWith(VARIABLE_PARAM_PREFIX)) fromUrl[key.slice(VARIABLE_PARAM_PREFIX.length)] = raw;
    if (Object.keys(fromUrl).length) this.store.setVariables({ ...this.store.variables(), ...fromUrl });
  }
  /* Effective variables for a flow, lowest to highest priority: flow declaration defaults,
     mount-option variables, then URL/session values. */
  variablesFor(flow = this.store.activeFlow()) {
    const merged = { ...window.ScreenReelCore.variableDefaults(flow?.variables), ...(this.options.variables || {}), ...this.store.variables() };
    return Object.keys(merged).length ? merged : null;
  }
  /* Interpolates a display string (scene title / talking points) at render time only. */
  displayText(value) { return window.ScreenReelCore.interpolate(value, this.variablesFor()).value; }
  mountUi() {
    if (this.rootHost) return;
    this.rootHost = document.createElement('div'); this.rootHost.id = `screenreel-projector-${this.store.projectId}`; document.body.appendChild(this.rootHost); this.shadow = this.rootHost.attachShadow({ mode: 'open' });
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = this.assetUrl('screenreel.css'); this.shadow.appendChild(link);
    const shell = document.createElement('div'); shell.className = 'sr-shell'; shell.innerHTML = '<div class="sr-pill" role="toolbar" aria-label="ScreenReel projector"></div><section class="sr-notes" hidden></section><div class="sr-toast" hidden></div>'; this.shadow.appendChild(shell);
    this.pill = shell.querySelector('.sr-pill'); this.notes = shell.querySelector('.sr-notes'); this.toastNode = shell.querySelector('.sr-toast'); this.render();
  }
  render() {
    if (!this.pill) return; const flow = this.store.activeFlow(); const scenes = this.store.enabledScenes(flow); const position = Math.min(this.store.position(), Math.max(0, scenes.length - 1)); const scene = scenes[position];
    // Share mode is a viewer, not a presenter: progress, play/pause, and exit only.
    const share = this.store.share();
    this.pill.classList.toggle('sr-pill--share', share);
    const playButton = `<button data-cmd="play" class="sr-play" title="${this.store.playing() ? 'Pause' : 'Play'}">${icon(this.store.playing() ? 'pause' : 'play')}</button>`;
    // Narration control rides in both chromes: a viewer on a share link needs it most, and a
    // presenter talking over the demo needs to silence it fast. Hidden when there is no engine.
    const nextButton = `<button data-cmd="next" class="${this.awaitingNext ? 'sr-await-next' : ''}" title="Next scene">${icon('right')}</button>`;
    const prevButton = `<button data-cmd="prev" title="Previous scene">${icon('left')}</button>`;
    const muted = this.store.muted();
    const soundButton = this.options.narration === false || !window.__screenreelNarrator?.available()
      ? ''
      : `<button data-cmd="sound" class="${muted ? '' : 'active'}${this.narrationBlocked ? ' sr-needs-sound' : ''}" title="${muted ? 'Turn on narration' : 'Mute narration'}" aria-pressed="${String(!muted)}">${icon(muted ? 'mute' : 'sound')}</button>`;
    this.pill.innerHTML = share
      ? `<span class="sr-count">${scenes.length ? position + 1 : 0}/${scenes.length}</span>${this.advanceMode() === 'guided' ? prevButton : ''}${playButton}${this.advanceMode() === 'guided' ? nextButton : ''}${soundButton}<button data-cmd="exit" title="Exit demo mode">${icon('close')}</button>`
      : `<select class="sr-flow" aria-label="Active demo flow">${this.store.allFlows().map((item) => `<option value="${esc(item.id)}"${item.id === flow.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select><span class="sr-count">${scenes.length ? position + 1 : 0}/${scenes.length}</span>${prevButton}${playButton}${nextButton}${soundButton}<button data-cmd="notes" class="${this.store.notesVisible() ? 'active' : ''}" title="Presenter notes">${icon('notes')}</button><span class="sr-pill-separator" aria-hidden="true"></span><button data-cmd="studio" class="sr-pill-studio" title="Open Studio" aria-label="Open Studio">${icon('studio')}</button><button data-cmd="exit" title="Exit demo mode">${icon('close')}</button>`;
    const flowSelect = this.pill.querySelector('.sr-flow'); if (flowSelect) flowSelect.onchange = (e) => { this.pause(); this.store.setActive(e.target.value); this.store.setPosition(0); this.render(); };
    this.pill.querySelectorAll('[data-cmd]').forEach((button) => { button.onclick = () => this.command(button.dataset.cmd); });
    this.target.setAttribute('aria-pressed', String(this.store.enabled())); this.renderNotes(share ? null : scene);
  }
  renderNotes(scene) {
    const visible = this.store.notesVisible() && !!scene; this.notes.hidden = !visible;
    if (visible) { this.notes.innerHTML = `<div><span>Talking points</span><strong>${esc(this.displayText(scene.title))}</strong></div><p>${esc(this.displayText(scene.talkingPoints) || 'No talking points yet.')}</p><button data-edit>Edit scene</button>`; this.notes.querySelector('[data-edit]').onclick = () => this.openStudio({ flowId: this.store.activeFlow().id, sceneId: scene.id }); this.reserveNotes(true); }
    else this.reserveNotes(false);
  }
  reserveNotes(visible) {
    if (this.options.notesMode !== 'reserve') return;
    if (visible && this.originalPadding == null) { this.originalPadding = document.body.style.paddingBottom; document.body.style.paddingBottom = 'clamp(88px, 10vh, 136px)'; }
    if (!visible && this.originalPadding != null) { document.body.style.paddingBottom = this.originalPadding; this.originalPadding = null; }
  }
  command(command) {
    // A guided tour waiting on its finished scene continues exactly as an auto advance would,
    // so Next on the last scene of a non-looping flow completes it instead of wrapping.
    if (command === 'prev') this.previous(); else if (command === 'next') this.awaitingNext ? this.next(true) : this.next(); else if (command === 'play') this.store.playing() ? this.pause() : this.play();
    else if (command === 'notes') { this.store.setNotesVisible(!this.store.notesVisible()); this.render(); }
    /* Unmuting is itself the user gesture the autoplay policy wants, so speak the current scene
       immediately — otherwise the viewer waits until the next scene to hear anything. */
    else if (command === 'sound') {
      const unmuting = this.store.muted(); this.store.setMuted(!unmuting);
      if (unmuting) { this.narrationBlocked = false; this.render(); const { scene } = this.current(); if (scene && this.store.playing()) this.narrate(scene); }
      else { window.__screenreelNarrator?.cancel(); this.render(); }
    }
    /* `capture` is no longer offered by the pill: an unlabelled camera beside a labelled Studio
       button read as "record a video", which is what the CLI does — and captureCurrent() opens
       Studio anyway, so Studio is the honest single entry point. The command stays because a host
       calling command('capture') or captureCurrent() directly still works. */
    else if (command === 'capture') this.captureCurrent(); else if (command === 'studio') this.openStudio(); else if (command === 'exit') this.disable('user');
  }
  /* Notes ride the same time scale as the actions they describe, so a note never outlives
     the emphasis it is narrating (the main reason the tour read as rushed). */
  toast(message) { if (!this.toastNode) return; this.toastNode.textContent = message; this.toastNode.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { this.toastNode.hidden = true; }, TOAST_MS * (Number(this.options.timeScale) || 1)); }
  enable(emit = true) {
    this.store.setEnabled(true); this.target.setAttribute('aria-pressed', 'true'); this.mountUi(); this.cursor()?.show();
    if (!this.keyHandler) { this.keyHandler = (keyEvent) => this.handleKey(keyEvent); document.addEventListener('keydown', this.keyHandler); }
    if (emit) event('modechange', { projectId: this.store.projectId, enabled: true }); return this;
  }
  /* `reason` tells a host a skip from a finish: 'user' (pill, trigger, Esc), 'complete'
     (disableOnComplete), or 'api' (a host call, destroy()). */
  disable(reason = 'api') {
    const wasEnabled = this.store.enabled(); const { scene, position } = this.current(); const flowId = this.store.activeFlow()?.id;
    document.removeEventListener('keydown', this.keyHandler); this.keyHandler = null;
    this.pause(); this.store.setEnabled(false); this.store.clearRun(); this.reserveNotes(false); this.rootHost?.remove(); this.rootHost = null; this.shadow = null; this.pill = null; this.target.setAttribute('aria-pressed', 'false'); this.cursor()?.destroy(); window.__screenreelNarrator?.destroy(); document.querySelectorAll('.sr-action-box,.sr-glow-box,.sr-dim-backdrop,.sr-action-callout,.sr-snippet,.sr-cursor-ring,.sr-choice-overlay').forEach((node) => node.remove()); event('modechange', { projectId: this.store.projectId, enabled: false });
    if (wasEnabled) event('exit', { projectId: this.store.projectId, flowId, sceneId: scene?.id ?? null, position, reason });
    return this;
  }
  /* Guided tours are paced by the viewer. Keys typed into the host's own controls — or the
     projector's buttons, found through the shadow boundary — are left alone. */
  handleKey(keyEvent) {
    if (!this.store.playing() || this.advanceMode() !== 'guided') return;
    if (keyEvent.defaultPrevented || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
    const origin = keyEvent.composedPath?.()[0] || keyEvent.target;
    if (origin?.closest?.(HOST_CONTROL_SELECTOR)) return;
    const command = GUIDED_KEYS[keyEvent.key]; if (!command) return;
    keyEvent.preventDefault(); this.command(command);
  }
  /* Overlays a scene handed over (see settleOverlays in the runtime) go when the scene is left. */
  releaseOverlays() { const releases = this.retained; this.retained = []; releases.forEach((release) => release()); }
  /* Everything a scene leaves behind is undone here, whatever ended it: next, back, exit, pause,
     a choice jump, or navigation. `scene.cleanup` runs once per started scene and to completion —
     it never gets the abort signal, because a half-undone app is the state it exists to prevent. */
  async leaveScene(reason) {
    this.releaseOverlays();
    const scene = this.runningScene; this.runningScene = null;
    for (const action of scene?.cleanup || []) {
      const result = await window.ScreenReelCore.runAction(action, { document, window, resolveFunction: (name) => functions.get(name), variables: this.variablesFor(), warn: (message) => console.warn('[screenreel]', message) });
      if (!result.ok) console.warn(`[screenreel] cleanup ${action.type} failed leaving scene ${scene.id} (${reason})`);
    }
  }
  /* Back/Next inside a guided scene's final callout. Back is offered from the second scene on. */
  calloutControls(sceneIndex, sceneCount) {
    const finishing = sceneIndex >= sceneCount - 1 && this.options.loop === false;
    return {
      labels: { back: CALLOUT_LABELS.back, next: finishing ? CALLOUT_LABELS.finish : CALLOUT_LABELS.next },
      onBack: sceneIndex > 0 ? () => this.command('prev') : null,
      onNext: () => this.command('next'),
    };
  }
  /* Start a flow at a scene: the entry point for hosts that launch tours themselves (onboarding,
     a help menu). Throws on an unknown flow or an out-of-range position rather than guessing. */
  async start(flowId, { position = 0 } = {}) {
    const flow = this.store.getFlow(flowId); if (!flow) throw new Error(`ScreenReel start(): unknown flow "${flowId}"`);
    const sceneCount = this.store.enabledScenes(flow).length;
    if (!Number.isInteger(position) || position < 0 || position >= sceneCount) throw new Error(`ScreenReel start(): position ${position} is outside the ${sceneCount} enabled scenes of "${flowId}"`);
    this.pause(); await this.leaving;
    this.store.setActive(flow.id); this.store.setPosition(position);
    if (this.store.enabled()) this.render(); else this.enable();
    this.playScene(); // not awaited: it resolves only when the first scene finishes
    return this;
  }
  current() { const scenes = this.store.enabledScenes(); return { scenes, position: Math.min(this.store.position(), Math.max(0, scenes.length - 1)), scene: scenes[Math.min(this.store.position(), Math.max(0, scenes.length - 1))] }; }
  routeMatches(scene) {
    const currentRoute = this.router.getRoute();
    if (typeof this.options.routesEqual === 'function') {
      try { return !!this.options.routesEqual(currentRoute, scene.route); } catch (error) { console.warn('[screenreel] routesEqual failed', error); return false; }
    }
    return window.ScreenReelCore.normalizeRoute(currentRoute, location.href) === window.ScreenReelCore.normalizeRoute(scene.route, location.href);
  }
  async navigate(route) {
    const before = new URL(location.href); await this.router.navigate(route);
    if (!this.usesDefaultNavigation) return true;
    const after = new URL(location.href); return before.origin === after.origin && before.pathname === after.pathname && before.search === after.search;
  }
  advancePosition() {
    const { scenes, position } = this.current(); if (!scenes.length) return null;
    const next = (position + 1) % scenes.length; this.store.setPosition(next); this.render(); return scenes[next];
  }
  complete() {
    this.pause(); const { scene, position, scenes } = this.current(); this.analytics.emit('flow_complete'); event('complete', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene?.id, position, sceneCount: scenes.length });
    if (this.options.disableOnComplete) this.disable('complete');
    return this;
  }
  validateScene(sceneId) {
    const flow = this.store.activeFlow(); const scene = sceneId ? flow.scenes.find((item) => item.id === sceneId) : this.current().scene;
    if (!scene) return { ok: false, flowId: flow.id, sceneId: sceneId || null, route: null, sceneErrors: ['Scene not found'], actions: [] };
    const sceneErrors = []; if (!this.routeMatches(scene)) sceneErrors.push(`Current route does not match ${scene.route}`);
    if (scene.waitFor) { try { if (!document.querySelector(scene.waitFor)) sceneErrors.push(`waitFor has no matches: ${scene.waitFor}`); } catch { sceneErrors.push(`waitFor is invalid: ${scene.waitFor}`); } }
    const actions = (scene.actions || []).map((action, actionIndex) => {
      const errors = window.ScreenReelCore.validate(action, document, location.href);
      if (action.type === 'call' && !functions.has(action.fn) && typeof window[action.fn] !== 'function') errors.push(`Function is not registered: ${action.fn}`);
      return { actionIndex, actionId: action.id, type: action.type, selector: action.selector, errors };
    });
    const report = { ok: !sceneErrors.length && actions.every((item) => !item.errors.length), flowId: flow.id, sceneId: scene.id, route: scene.route, sceneErrors, actions };
    event('validation', { projectId: this.store.projectId, report }); return report;
  }
  actionFailed(scene, action, actionIndex, result) {
    const report = { ok: false, flowId: this.store.activeFlow().id, sceneId: scene.id, route: scene.route, sceneErrors: [], actions: [{ actionIndex, actionId: action.id, type: action.type, selector: action.selector, errors: [result.error || 'Action failed'] }] };
    event('validation', { projectId: this.store.projectId, report }); this.toast(actionIndex < 0 ? 'Scene readiness failed' : `Scene stopped at action ${actionIndex + 1}`); this.pause(); return report;
  }
  /* Public entry. A second play() while a scene is already running would start a parallel run —
     two narrators, every click doubled — so it is refused loudly instead. */
  play() {
    if (this.store.playing() && this.runningScene) { console.warn('[screenreel] play() ignored: a scene is already playing'); return Promise.resolve(); }
    return this.playScene();
  }
  async playScene() {
    await this.leaving; // a previous scene's cleanup must finish before this one touches the app
    const { scene } = this.current(); if (!scene) return; const generation = ++this.playGeneration; clearTimeout(this.timer); this.timer = null; this.awaitingNext = false; this.store.setPlaying(true); this.render();
    if (!this.routeMatches(scene)) {
      const sameDocument = await this.navigate(scene.route);
      if (sameDocument && generation === this.playGeneration && this.store.playing() && this.routeMatches(scene)) return this.playScene();
      return;
    }
    this.runningScene = scene;
    if (!this.analytics.viewStarted()) { this.analytics.markViewStarted(); this.analytics.emit('view_start'); }
    this.analytics.emit('scene_enter');
    this.dropOffSent = false;
    this.controller?.abort(); this.controller = new AbortController();
    if (scene.waitFor) {
      const ready = await window.ScreenReelCore.waitFor(document, scene.waitFor, 'visible', Number(scene.timeoutMs) || window.ScreenReelCore.ELEMENT_WAIT_TIMEOUT_MS, this.controller.signal);
      if (!ready) {
        const result = { ok: false, error: `Scene readiness timed out: ${scene.waitFor}` };
        console.warn('[screenreel]', result.error); if (this.options.strict) return this.actionFailed(scene, { id: null, type: 'waitFor', selector: scene.waitFor }, -1, result);
      }
    }
    const settleMs = Number(scene.settleMs ?? this.store.activeFlow().defaults?.settleMs ?? 0);
    if (settleMs && generation === this.playGeneration && this.store.playing()) await window.ScreenReelCore.sleep(settleMs, this.controller.signal);
    if (generation !== this.playGeneration || !this.store.playing()) return;
    const { position: sceneIndex } = this.current();
    if (sceneIndex === 0) await this.introducePill();
    if (generation !== this.playGeneration || !this.store.playing()) return;
    // Narration starts with the scene's actions and runs alongside them, not before: the viewer
    // should hear the description of the thing while watching it happen. Deliberately not awaited.
    this.narrate(scene);
    const guided = this.advanceMode(scene) === 'guided'; const lastIndex = (scene.actions || []).length - 1;
    for (let actionIndex = 0; actionIndex < (scene.actions || []).length; actionIndex++) {
      const action = scene.actions[actionIndex];
      if (generation !== this.playGeneration || !this.store.playing()) break;
      event('step', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene.id, sceneIndex, sceneTitle: scene.title, actionIndex, total: (scene.actions || []).length, action });
      let navigationSameDocument = false; let priorPosition = null;
      const persist = guided && actionIndex === lastIndex && PERSISTABLE_TYPES.has(window.ScreenReelCore.actionType(action));
      const result = await window.ScreenReelCore.runAction(action, {
        document, window, signal: this.controller.signal, resolveFunction: (name) => functions.get(name),
        variables: this.variablesFor(),
        // The executor already calls these at every interaction site; supplying them is what makes
        // the agent cursor visible during a live tour instead of a no-op.
        moveCursor: this.options.cursor === false ? undefined : async (el) => { if (el) await this.cursor()?.moveTo(el)?.catch?.(() => {}); },
        pressCursor: this.options.cursor === false ? undefined : async () => { await this.cursor()?.press()?.catch?.(() => {}); },
        scrollCursor: this.options.cursor === false ? undefined : (direction) => this.cursor()?.startBob(direction),
        stopScrollCursor: this.options.cursor === false ? undefined : () => this.cursor()?.stopBob(),
        // An action's line REPLACES whatever is currently speaking (speak() cancels in flight):
        // a queue would drift behind the visuals, and the words must land on what is on screen.
        // narrator() is null when the viewer muted or the host opted out, so this stays silent.
        narrateAction: (text) => { this.narrator()?.speak(text); },
        navigate: async (route) => {
          // Navigation actions are terminal: persist the next scene before a hard navigation can unload this document.
          await this.leaveScene('navigate');
          const { scenes, position } = this.current(); priorPosition = position;
          if (position >= scenes.length - 1 && this.options.loop === false) this.complete(); else this.advancePosition();
          try { navigationSameDocument = await this.navigate(route); } catch (error) { this.store.setPosition(priorPosition); this.render(); throw error; }
        },
        dim: this.options.dim,
        persist, retain: (release) => this.retained.push(release),
        calloutControls: persist ? this.calloutControls(sceneIndex, this.current().scenes.length) : undefined,
        announce: (message) => this.toast(message),
        warn: (message) => { console.warn('[screenreel]', message); this.toast(message); },
      });
      if (result.jumpTo && generation === this.playGeneration && this.store.playing()) {
        // Choice jump: positions index into enabledScenes, so resolve there — never raw flow.scenes.
        const enabled = this.store.enabledScenes();
        const targetIndex = enabled.findIndex((item) => item.id === result.jumpTo);
        if (targetIndex === -1) { this.toast(`Unknown choice target: ${result.jumpTo}`); continue; }
        event('choice', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene.id, targetSceneId: result.jumpTo, actionIndex });
        this.analytics.emit('choice', { targetSceneId: result.jumpTo });
        await this.leaveScene('choice');
        this.store.setPosition(targetIndex); this.render();
        return this.playScene();
      }
      if (result.navigated) {
        const nextScene = this.current().scene;
        if (navigationSameDocument && generation === this.playGeneration && this.store.playing() && nextScene && this.routeMatches(nextScene)) return this.playScene();
        return;
      }
      if (!result.ok && this.options.strict) return this.actionFailed(scene, action, actionIndex, result);
    }
    if (generation !== this.playGeneration || !this.store.playing()) return;
    /* Hold the scene until narration finishes rather than cutting a sentence mid-word. Capture
       solves the same overrun by freezing the last frame (voice.overflow: 'extend'); a live
       product cannot be frozen, so the wait happens here instead — bounded, so one long note can
       never stall the tour. Scenes with no narration are unaffected. */
    await this.narrator()?.settle(Number(scene.narrationCapMs) || undefined);
    if (generation !== this.playGeneration || !this.store.playing()) return;
    this.analytics.emit('scene_complete');
    if (this.advanceMode() === 'guided') { this.awaitingNext = true; this.render(); event('awaitingnext', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene.id }); return; }
    const delay = Number(scene.dwellMs ?? this.store.activeFlow().defaults?.dwellMs ?? DEFAULT_DWELL_MS); this.timer = setTimeout(() => this.next(true, generation), delay);
  }
  /* Introduce the control pill before the first action runs, so the viewer sees which flow is
     about to play and where the controls are. Resolves when the beat is over. */
  async introducePill() {
    const pill = this.pill;
    if (!pill || pill.dataset.intro === 'done') return;
    const beat = PILL_INTRO_MS * (Number(this.options.timeScale) || 1);
    pill.style.setProperty('--sr-pill-intro', `${beat}ms`);
    pill.dataset.intro = 'true';
    await window.ScreenReelCore.sleep(PILL_INTRO_MS, this.controller?.signal);
    // Held by reference: disable() (or opening Studio) during the beat drops this.pill to null.
    pill.dataset.intro = 'done';
  }
  pause() { this.playGeneration++; this.awaitingNext = false; this.leaving = this.leaveScene('pause').catch((error) => console.warn('[screenreel] scene cleanup failed', error)); this.store.setPlaying(false); this.controller?.abort(); clearTimeout(this.timer); this.timer = null; this.cursor()?.stopBob(); window.__screenreelNarrator?.cancel(); this.render(); return this; }
  async next(autoPlay = false, expectedGeneration = null) {
    if (expectedGeneration != null && expectedGeneration !== this.playGeneration) return;
    const current = this.current(); if (autoPlay && this.options.loop === false && current.position >= current.scenes.length - 1) return this.complete();
    const shouldPlay = autoPlay || this.store.playing();
    const generation = ++this.playGeneration; this.awaitingNext = false; this.controller?.abort(); clearTimeout(this.timer); this.timer = null;
    this.leaving = this.leaveScene('next'); await this.leaving;
    if (generation !== this.playGeneration) return; // another command arrived during cleanup
    const scene = this.advancePosition(); if (!scene) return;
    if (!this.routeMatches(scene)) {
      const sameDocument = await this.navigate(scene.route);
      if (sameDocument && generation === this.playGeneration && shouldPlay && this.store.playing() && this.routeMatches(scene)) return this.playScene();
    } else if (shouldPlay && this.store.playing()) return this.playScene();
  }
  /* Presenter Back pauses on the previous scene. Guided Back plays it, the way a viewer expects,
     and does nothing on the first scene rather than wrapping to the end of the tour. */
  async previous() {
    const { scenes, position } = this.current(); if (!scenes.length) return;
    const guided = this.advanceMode() === 'guided' && this.store.playing();
    if (guided && position === 0) return;
    this.pause();
    const target = (position - 1 + scenes.length) % scenes.length; this.store.setPosition(target); this.render();
    if (guided) { this.store.setPlaying(true); return this.playScene(); }
    if (!this.routeMatches(scenes[target])) await this.router.navigate(scenes[target].route);
  }
  captureCurrent() {
    let flow = this.store.activeFlow(); if (flow.readonly) flow = this.store.createCopy(flow, `My ${flow.name}`);
    const route = window.ScreenReelCore.normalizeRoute(this.router.getRoute(), location.href) || '/'; const scene = { id: window.ScreenReelStore.makeId('scene'), enabled: true, route, title: document.title || 'Captured scene', talkingPoints: '', dwellMs: window.ScreenReelStore.NEW_FLOW_DEFAULTS.dwellMs, actions: [] };
    flow.scenes.push(scene); flow = this.store.save(flow); this.toast('Scene captured locally'); this.openStudio({ flowId: flow.id, sceneId: scene.id });
  }
  async openStudio(selection = {}) { const module = await import(this.assetUrl('studio.js')); return module.openStudio({ projector: this, store: this.store, assetBase: this.assetBase, assetVersion: this.assetVersion, ...selection }); }
  destroy() { this.disable(); this.target.removeEventListener('click', this.clickHandler); removeEventListener('pagehide', this.dropOffHandler); document.removeEventListener('visibilitychange', this.visibilityHandler); this.unsubscribe?.(); instances.delete(this); }
}

export function createPublicApi(assetBase, assetVersion = '') {
  if (publicApi) return publicApi;
  publicApi = {
    assetBase,
    async mount(target, options) { if (!target) throw new Error('ScreenReel.mount requires a target element'); return new Projector(target, options, assetBase, assetVersion).init(); },
    async openStudio(options = {}) { const instance = [...instances][0]; if (!instance) throw new Error('Mount a ScreenReel projector before opening Studio'); return instance.openStudio(options); },
    registerFn(name, fn) { if (!/^[A-Za-z_$][\w$]*$/.test(name || '') || typeof fn !== 'function') throw new Error('ScreenReel.registerFn requires a valid name and function'); functions.set(name, fn); return () => publicApi.unregisterFn(name, fn); },
    unregisterFn(name, fn) { if (!fn || functions.get(name) === fn) functions.delete(name); },
    validateScene(sceneId) { const instance = [...instances][0]; if (!instance) throw new Error('Mount a ScreenReel projector before validating a scene'); return instance.validateScene(sceneId); },
    instances,
  };
  class ScreenReelElement extends HTMLElement {
    async connectedCallback() {
      if (this.instance) return; const shadow = this.attachShadow({ mode: 'open' }); const link = document.createElement('link'); link.rel = 'stylesheet'; const styleUrl = new URL('screenreel.css', assetBase); if (assetVersion) styleUrl.search = assetVersion; link.href = styleUrl.href; shadow.appendChild(link);
      const button = document.createElement('button'); button.className = 'sr-trigger'; button.title = 'Toggle ScreenReel demo'; button.setAttribute('aria-label', 'Toggle ScreenReel demo'); button.innerHTML = icon('presentation', TRIGGER_ICON_PX); shadow.appendChild(button);
      let data; const inlineId = this.getAttribute('flow-data'); if (inlineId) { const node = document.getElementById(inlineId); if (node) data = JSON.parse(node.textContent); }
      this.instance = await publicApi.mount(button, { projectId: this.getAttribute('project-id') || 'screenreel', assetBase: this.getAttribute('asset-base') || assetBase, flow: data ? { data } : { src: this.getAttribute('flow-src') }, notesMode: this.getAttribute('notes-mode') || 'reserve', loop: this.getAttribute('loop') !== 'false', strict: this.hasAttribute('strict'), ...(this.hasAttribute('advance') ? { advance: this.getAttribute('advance') } : {}) });
    }
    disconnectedCallback() { this.instance?.destroy(); this.instance = null; }
  }
  if (!customElements.get('screenreel-projector')) customElements.define('screenreel-projector', ScreenReelElement);
  return publicApi;
}
