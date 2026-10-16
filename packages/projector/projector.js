import { icon } from './icons.js';
import { createAnalytics } from './analytics.js';

const instances = new Set();
const functions = new Map();
const TOAST_MS = 2600;
const PILL_INTRO_MS = 1100;
const VARIABLE_PARAM_PREFIX = 'srv_';
const DEFAULT_DWELL_MS = 3000;         // rest after a scene when neither it nor its flow sets dwellMs
const TRIGGER_ICON_PX = 18;
/* Every string the guide surface shows. Hosts pass `labels` to translate any of them. */
const DEFAULT_LABELS = {
  back: 'Back', next: 'Next', finish: 'Finish', skip: 'Skip tour', close: 'Close',
  stepOf: (step, total) => `${step} of ${total}`,
  chooserHint: 'Take the tour at your pace, or sit back and watch.',
  guided: 'Guided', guidedHint: 'One step at a time. Press Next to continue.',
  autoplay: 'Autoplay', autoplayHint: 'Plays by itself. Pause anytime.',
  video: 'Video', videoHint: 'Watch it like a video, with cards.',
  clean: 'Clean video', cleanHint: 'Watch it like a video, with captions instead of cards.',
  // The pill moves between scenes; the guided card's Next moves between steps (info cards).
  previousScene: 'Previous scene', nextScene: 'Next scene', nextStep: 'Next step', play: 'Play', pause: 'Pause', exit: 'Exit demo mode',
  sceneOf: (scene, total) => `Scene ${scene} of ${total}`,
  startHint: (mode, scenes) => `${mode} · ${scenes} ${scenes === 1 ? 'scene' : 'scenes'}`,
  finished: 'Finished', endHint: (scenes) => `You have seen all ${scenes} ${scenes === 1 ? 'scene' : 'scenes'}.`, replay: 'Replay',
};
/* Pill controls in display order; a mode's `controls` setting picks a subset (see core/playback.js). */
/* playback.js must load first (the loader does). Fail with the real cause, not an opaque TypeError. */
if (!window.ScreenReelPlayback) throw new Error('ScreenReel: playback.js is not loaded. Vendor the whole dist/projector folder and load screenreel.js.');
const PILL_CONTROLS = window.ScreenReelPlayback.PILL_CONTROLS;
/* step-clock.js times a step's actions (docs/playback.md#timed-steps-and-narration-audio); the loader loads it too. */
if (!window.ScreenReelStepClock) throw new Error('ScreenReel: step-clock.js is not loaded. Vendor the whole dist/projector folder and load screenreel.js.');
const SHARE_CONTROLS = ['count', 'play', 'sound', 'exit'];
const GUIDED_SHARE_CONTROLS = ['count', 'prev', 'play', 'next', 'sound', 'exit'];
const PILL_POSITIONS = ['right', 'center'];
/* The start card (video, clean video and autoplay) and the end card stay up this long, scaled by timeScale. */
const START_CARD_MS = 1800;
const END_CARD_MS = 4000;
/* Older options, each named once per page with what replaces it (docs/playback.md#migrating). */
const DEPRECATION_HINTS = {
  advance: "mount `advance` → `playback: { force: 'guided' | 'autoplay' }`",
  chooser: "mount `chooser: true` → `playback: { force: 'ask' }` (or let each flow's `defaults.playback.default` decide)",
  controls: 'mount `controls` → `playback: { guided: { controls: [...] }, autoplay: { controls: [...] } }`',
};
const hinted = new Set();
function hintOnce(name) {
  if (hinted.has(name) || !DEPRECATION_HINTS[name]) return;
  hinted.add(name); console.info(`[screenreel] ${DEPRECATION_HINTS[name]}. The older option still works; see docs/playback.md.`);
}
/* Authoring controls a share-link viewer never gets, whatever `controls` says. */
const PRESENTER_ONLY_CONTROLS = new Set(['flow', 'notes', 'studio']);
/* The tour layer's own box: full-screen and click-through, overriding the UA popover style (a
   centred, bordered, fit-content box). Inline, so a missing stylesheet cannot break it. */
const LAYER_STYLE = 'position:fixed;inset:0;margin:0;padding:0;border:0;width:auto;height:auto;max-width:none;max-height:none;overflow:visible;background:transparent;color:inherit;pointer-events:none;';
/* Stacking inside the tour layer, bottom to top: click shield < dim backdrop < rings, ripples, cards (runtime) < projector shell. */
const SHIELD_Z_INDEX = 2147481990;
/* Guided-tour keys, the ones a slide deck uses. */
const GUIDED_KEYS = { ArrowRight: 'next', Enter: 'next', ArrowLeft: 'prev' };
/* The pill's Play/Pause key (handlePlayKey), and where it is typing rather than a command. */
const PLAY_KEY = ' ';
const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable]';
/* Leaving a scene for one of these reasons cuts it short, so its changes are undone (see leaveScene). */
const INTERRUPTING_REASONS = new Set(['pause', 'choice']);
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
    this.target = target; this.options = { activationQueryParam: 'demo', notesMode: 'reserve', loop: true, strict: false, timeScale: 1, cursor: 'dot', narration: true, shield: true, studio: true, position: 'right', ...options }; this.assetBase = options.assetBase || assetBase; this.assetVersion = assetVersion;
    this.usesDefaultNavigation = !options.router?.navigate; this.router = { ...defaultRouter(), ...(options.router || {}) }; this.controller = null; this.timer = null; this.playGeneration = 0; this.originalPadding = null; this.rootHost = null; this.shadow = null;
    this.retained = []; this.stepReleases = []; this.stepWaiter = null; this.timedStep = null; this.timedReleases = []; this.held = null; this.stepAudio = null; this.runningScene = null; this.runningSceneFinished = false; this.journal = []; this.leaving = Promise.resolve();
    this.store = new window.ScreenReelStore.Store({ projectId: options.projectId, flow: options.flow, baseHref: location.href, legacyStorage: options.legacyStorage });
    this.playback = window.ScreenReelPlayback.mountConfig(options);
    window.ScreenReelPlayback.validateMountPlayback(options.playback).forEach((message) => console.warn(`[screenreel] ${message}`));
    this.playback.deprecated.forEach(hintOnce);
  }
  /* Playback (core/playback.js, docs/playback.md). A run's mode is fixed when it starts: start()'s
     `mode` or the viewer's chooser pick is kept for the run, so it survives page navigations.
     Otherwise it follows the configuration — the host's `playback.force`, the flow's default, the
     host's default, autoplay — and a scene's own `advance` can switch that one scene. */
  playMode(scene = this.current().scene, flow = this.store.activeFlow()) {
    const playback = window.ScreenReelPlayback;
    const chosen = playback.modeName(this.store.advanceChoice());
    if (chosen) return chosen;
    if (scene?.advance != null) {
      const own = playback.modeName(scene.advance);
      if (own) return own;
      console.warn(`[screenreel] Unknown scene advance "${scene.advance}"; expected ${[...playback.MODES, 'auto'].join(', ')}`);
    }
    return this.configuredMode(flow);
  }
  /* The mode the configuration picks without asking anyone — what an author's Play and a share
     link use. An 'ask' flow plays autoplay here, as it always has. */
  configuredMode(flow = this.store.activeFlow()) {
    const playback = window.ScreenReelPlayback;
    return playback.resolveMode({ flow: playback.flowConfig(flow), mount: this.playback, canAsk: false }).mode;
  }
  /* Every setting of the mode a scene plays in: the mode's preset with the host's and the flow's overrides. */
  settings(scene = this.current().scene, flow = this.store.activeFlow()) {
    const playback = window.ScreenReelPlayback; const mode = this.playMode(scene, flow);
    // Called from every render, cursor and narrator lookup; the result only changes with the flow (or its edits) and the mode.
    const key = `${flow?.id}|${flow?.updatedAt ?? ''}|${mode}`;
    if (this.settingsCache?.key !== key) this.settingsCache = { key, value: playback.resolveSettings(mode, playback.flowConfig(flow), this.playback) };
    return this.settingsCache.value;
  }
  labels() { return { ...DEFAULT_LABELS, ...(this.options.labels || {}) }; }
  /* With a host `functions` map, `call` resolves only through it and registerFn — never through
     window, so a flow cannot reach page globals. Without one, the window fallback stays (0.3 hosts). */
  resolveFunction(name) {
    const own = this.options.functions;
    if (own && Object.prototype.hasOwnProperty.call(own, name)) return own[name];
    return functions.get(name);
  }
  strictFunctions() { return !!this.options.functions; }
  assetUrl(name) { const url = new URL(name, this.assetBase); if (this.assetVersion) url.search = this.assetVersion; return url.href; }
  /* Shared agent cursor, configured to this projector's glyph. Null when the host or the mode opted out. */
  cursor() {
    if (this.options.cursor === false || !this.settings().cursor) return null;
    const cursor = window.__screenreelCursor; if (!cursor) return null;
    const config = { glyph: this.options.cursor === true ? 'dot' : this.options.cursor };
    if (this.options.cursorMotion) config.motion = this.options.cursorMotion;
    return cursor.configure(config);
  }
  /* Live narrator, or null when the host or the mode opted out, the browser has no speech engine,
     or the viewer muted it. Every call site treats null as "stay silent", so narration is additive. */
  narrator() {
    if (this.options.narration === false || this.speechOff() || !this.settings().narration || this.store.muted()) return null;
    const narrator = window.__screenreelNarrator;
    if (!narrator?.available()) return null;
    return narrator.configure(this.options.narration === true ? {} : this.options.narration);
  }
  /* Mount `narration: { speech: false }`: narration plays only from pre-recorded files (a card's
     `narrationAudio`); the browser's speech engine is never used, so a step without a file is silent. */
  speechOff() { const narration = this.options.narration; return typeof narration === 'object' && narration !== null && narration.speech === false; }
  /* The audio-file narrator, or null when the host or the mode opted out of narration, the viewer
     muted it, or the browser has no Audio. Like narrator(), null means "stay silent". */
  audioNarrator() {
    if (this.options.narration === false || !this.settings().narration || this.store.muted()) return null;
    const audio = window.__screenreelAudioNarrator;
    return audio?.available() ? audio : null;
  }
  flowHasAudio(flow = this.store.activeFlow()) {
    return (flow?.scenes || []).some((scene) => (scene.actions || []).some((action) => window.ScreenReelCore.isGuidedStep(action) && action.narrationAudio));
  }
  /* A card's narrationAudio, resolved like the page's other assets: relative to the document. */
  audioUrl(value) {
    if (!value) return null;
    try { return new URL(String(value), document.baseURI).href; } catch { console.warn(`[screenreel] narrationAudio is not a valid URL: ${value}`); return null; }
  }
  /* Play a step's narration file from `offsetMs`. Never awaited: the step's timeline does not wait
     for audio. Blocked audio (the autoplay policy) is reported once, like blocked speech. */
  playStepAudio(url, offsetMs = 0) {
    const audio = this.audioNarrator(); if (!audio || !url) return;
    audio.play(url, { offsetMs }).then(({ played, reason }) => {
      if (played) { this.narrationBlocked = false; return; }
      if (reason === 'blocked' && !this.narrationBlocked) {
        this.narrationBlocked = true;
        if (this.visibleControls(this.store.share()).includes('sound')) this.toast('Tap the speaker to turn on narration');
        else console.info('[screenreel] The browser blocked narration audio until the viewer interacts with the page.');
        this.render();
      } else if (reason === 'error') console.warn(`[screenreel] narration audio failed to play: ${url}`);
    });
  }
  stopStepAudio() { this.stepAudio = null; window.__screenreelAudioNarrator?.stop(); }
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
    await this.store.ready(); this.applyPendingRestore(); window.ScreenReelCore.setTimeScale(this.options.timeScale); this.analytics = createAnalytics({ store: this.store, options: this.options.analytics || {} }); this.parseActivation(); this.bindTarget(); this.unsubscribe = this.router.subscribe?.(() => this.render());
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
    this.ensureLayer(); this.rootHost = document.createElement('div'); this.rootHost.id = `screenreel-projector-${this.store.projectId}`; this.layer.appendChild(this.rootHost); this.shadow = this.rootHost.attachShadow({ mode: 'open' });
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = this.assetUrl('screenreel.css'); this.shadow.appendChild(link);
    const shell = document.createElement('div'); shell.className = 'sr-shell'; shell.innerHTML = '<div class="sr-progress" role="progressbar" aria-valuemin="0" hidden><div class="sr-progress-fill"></div><span class="sr-progress-label"></span></div><div class="sr-pill" role="toolbar" aria-label="ScreenReel projector"></div><section class="sr-notes" hidden></section><div class="sr-toast" hidden></div><div class="sr-caption" role="status" aria-live="polite" hidden></div><div class="sr-chooser-layer" hidden></div>'; this.shadow.appendChild(shell);
    this.chooserLayer = shell.querySelector('.sr-chooser-layer'); this.progress = shell.querySelector('.sr-progress'); this.caption = shell.querySelector('.sr-caption');
    this.pill = shell.querySelector('.sr-pill'); this.notes = shell.querySelector('.sr-notes'); this.toastNode = shell.querySelector('.sr-toast'); this.render();
  }
  /* Which pill controls show: the mode's `controls` setting. `null` (a run configured only by the
     older options) keeps the old default: everything for a presenter, progress and playback for a
     share-link viewer. A share-link viewer never gets the authoring controls, and `studio: false`
     drops Studio. An empty set hides the pill, as a guided tour driven from its cards does. */
  visibleControls(share, settings = this.settings()) {
    const guided = settings.mode === 'guided';
    const base = settings.controls ?? (share ? (guided ? GUIDED_SHARE_CONTROLS : SHARE_CONTROLS) : PILL_CONTROLS);
    const unknown = base.filter((name) => !PILL_CONTROLS.includes(name));
    if (unknown.length) console.warn(`[screenreel] Unknown pill controls: ${unknown.join(', ')}`);
    return PILL_CONTROLS.filter((name) => base.includes(name)
      && !(name === 'studio' && this.options.studio === false)
      && !(share && PRESENTER_ONLY_CONTROLS.has(name)));
  }
  render() {
    if (!this.pill) return; const flow = this.store.activeFlow(); const scenes = this.store.enabledScenes(flow); const position = Math.min(this.store.position(), Math.max(0, scenes.length - 1)); const scene = scenes[position];
    const share = this.store.share(); const settings = this.settings(scene, flow); const labels = this.labels();
    const playing = this.store.playing(); const muted = this.store.muted();
    const waiting = !!this.stepWaiter;
    /* The pill moves between scenes. Only while a guided card waits does its Next continue the step. */
    const nextLabel = waiting ? labels.nextStep : labels.nextScene;
    const text = (label) => settings.controlLabels ? `<span class="sr-pill-label">${esc(label)}</span>` : '';
    const showPause = playing && !this.held; // a held timed step shows Play: the viewer paused it
    const speechAvailable = !this.speechOff() && window.__screenreelNarrator?.available();
    const audioAvailable = window.__screenreelAudioNarrator?.available() && this.flowHasAudio(flow);
    const narrationAvailable = this.options.narration !== false && (speechAvailable || audioAvailable);
    const buttons = {
      flow: `<select class="sr-flow" aria-label="Active demo flow">${this.store.allFlows().map((item) => `<option value="${esc(item.id)}"${item.id === flow.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select>`,
      count: `<span class="sr-count">${scenes.length ? position + 1 : 0}/${scenes.length}</span>`,
      prev: `<button data-cmd="prev" title="${esc(labels.previousScene)}" aria-label="${esc(labels.previousScene)}">${icon('left')}${text(labels.previousScene)}</button>`,
      play: `<button data-cmd="play" class="sr-play" title="${esc(showPause ? labels.pause : labels.play)}" aria-label="${esc(showPause ? labels.pause : labels.play)}">${icon(showPause ? 'pause' : 'play')}</button>`,
      next: `<button data-cmd="next" class="${waiting ? 'sr-await-next' : ''}" title="${esc(nextLabel)}" aria-label="${esc(nextLabel)}">${text(nextLabel)}${icon('right')}</button>`,
      // Narration rides in both chromes: a share-link viewer needs it most, and a presenter talking
      // over the demo needs to silence it fast. Hidden when there is no engine.
      sound: narrationAvailable ? `<button data-cmd="sound" class="${muted ? '' : 'active'}${this.narrationBlocked ? ' sr-needs-sound' : ''}" title="${muted ? 'Turn on narration' : 'Mute narration'}" aria-pressed="${String(!muted)}">${icon(muted ? 'mute' : 'sound')}</button>` : '',
      notes: `<button data-cmd="notes" class="${this.store.notesVisible() ? 'active' : ''}" title="Presenter notes">${icon('notes')}</button>`,
      studio: `<span class="sr-pill-separator" aria-hidden="true"></span><button data-cmd="studio" class="sr-pill-studio" title="Open Studio" aria-label="Open Studio">${icon('studio')}</button>`,
      exit: `<button data-cmd="exit" title="${esc(labels.exit)}" aria-label="${esc(labels.exit)}">${icon('close')}</button>`,
    };
    const controls = this.visibleControls(share, settings);
    this.renderProgress(settings.progress && scenes.length && !this.resolveChooser ? { position, total: scenes.length, scene } : null); // not behind the chooser: nothing has started
    this.pill.innerHTML = controls.map((name) => buttons[name]).join('');
    this.pill.hidden = !controls.length;
    this.pill.classList.toggle('sr-pill--share', share);
    const pillPosition = PILL_POSITIONS.includes(this.options.position) ? this.options.position : PILL_POSITIONS[0];
    this.pill.classList.toggle('sr-pill--center', pillPosition === 'center');
    const flowSelect = this.pill.querySelector('.sr-flow'); if (flowSelect) flowSelect.onchange = (e) => { this.pause(); this.store.setActive(e.target.value); this.store.setPosition(0); this.render(); };
    this.pill.querySelectorAll('[data-cmd]').forEach((button) => { button.onclick = () => this.command(button.dataset.cmd); });
    this.target.setAttribute('aria-pressed', String(this.store.enabled())); this.renderNotes(controls.includes('notes') ? (share ? null : scene) : null); // notes only where the pill offers them
    this.syncShield();
  }
  /* The tour layer: one root for the pill, shield, cursor, and every overlay the runtime draws.
     Host pop-ups (CDK overlays, popovers, <dialog>) open in the browser's top layer above every
     z-index, so the layer is a top-layer popover too, re-raised whenever the tour may have been
     covered (top-layer order is show order). A modal <dialog> makes everything outside it inert,
     so while one is open the layer moves inside it. Without the Popover API it is a plain fixed
     layer in <body>, which is how ScreenReel behaved before. */
  ensureLayer() {
    const id = window.ScreenReelCore.LAYER_ID;
    let layer = document.getElementById(id);
    if (!layer) {
      layer = document.createElement('div'); layer.id = id; layer.style.cssText = LAYER_STYLE;
      if (typeof layer.showPopover === 'function') layer.setAttribute('popover', 'manual');
      document.body.appendChild(layer);
    }
    this.layer = layer; this.raiseLayer();
  }
  raiseLayer() {
    const layer = this.layer; if (!layer?.isConnected || typeof layer.showPopover !== 'function') return;
    const modal = [...document.querySelectorAll('dialog')].reverse().find((dialog) => dialog.matches(':modal'));
    const parent = modal || document.body;
    if (layer.matches(':popover-open')) layer.hidePopover();
    if (layer.parentNode !== parent) parent.appendChild(layer);
    layer.showPopover();
  }
  /* A transparent layer over the app while a tour plays, so a stray viewer click, drag, or wheel
     cannot change the app mid-flow. The tour's own clicks go straight to their targets
     (el.click()), and the pill, callout controls, and choice cards all sit above it. Its layout is
     inline so a missing or stale stylesheet can never silently disable it. */
  syncShield() {
    const wanted = this.store.enabled() && this.store.playing() && this.settings().shield;
    if (wanted && !this.shieldNode) {
      const node = document.createElement('div'); node.className = 'sr-click-shield'; node.setAttribute('aria-hidden', 'true');
      node.style.cssText = `position:fixed;inset:0;z-index:${SHIELD_Z_INDEX};background:transparent;`;
      node.addEventListener('wheel', (wheelEvent) => wheelEvent.preventDefault(), { passive: false });
      // The host's own demo trigger still works, so a viewer can always turn the demo off. It
      // usually lives in a header with its own stacking context, so it cannot be raised above the
      // shield; a click that lands on it is forwarded instead.
      node.addEventListener('click', (clickEvent) => {
        const rect = this.target.getBoundingClientRect();
        const onTrigger = clickEvent.clientX >= rect.left && clickEvent.clientX <= rect.right && clickEvent.clientY >= rect.top && clickEvent.clientY <= rect.bottom;
        if (onTrigger) this.target.click();
      });
      node.style.pointerEvents = 'auto'; this.layer.prepend(node); this.shieldNode = node;
    }
    if (!wanted && this.shieldNode) { this.shieldNode.remove(); this.shieldNode = null; }
  }
  /* The chooser: one button per offered mode, the preselected (or first) one primary and focused.
     Resolves the picked mode, or null if dismissed. */
  chooseMode(flow, offered, preselect = null) {
    const labels = this.labels(); const layer = this.chooserLayer; const primary = preselect ?? offered[0];
    const options = offered.map((mode) => `<button type="button" class="sr-mode${mode === primary ? ' sr-mode--primary' : ''}" data-choose="${mode}"><strong>${esc(labels[mode])}</strong><span>${esc(labels[`${mode}Hint`])}</span></button>`).join('');
    layer.innerHTML = `<div class="sr-chooser" role="dialog" aria-modal="true" aria-labelledby="sr-chooser-title"><button type="button" class="sr-chooser-close" data-choose="" aria-label="${esc(labels.close)}" title="${esc(labels.close)}">${icon('close')}</button><h2 id="sr-chooser-title">${esc(this.displayText(flow.name))}</h2><p>${esc(labels.chooserHint)}</p><div class="sr-chooser-options">${options}</div></div>`;
    layer.hidden = false;
    return new Promise((resolve) => {
      this.resolveChooser = (mode) => { this.resolveChooser = null; layer.hidden = true; layer.innerHTML = ''; resolve(mode); };
      this.render();
      layer.querySelectorAll('[data-choose]').forEach((button) => { button.onclick = () => this.resolveChooser?.(button.dataset.choose || null); });
      layer.querySelector(`[data-choose="${primary}"]`).focus({ preventScroll: true });
    });
  }
  /* A thin bar across the top: how far through the flow the viewer is, by scene. */
  renderProgress(state) {
    if (!this.progress) return;
    this.progress.hidden = !state; if (!state) return;
    const { position, total, scene } = state; const labels = this.labels();
    this.progress.setAttribute('aria-valuemax', String(total)); this.progress.setAttribute('aria-valuenow', String(position + 1));
    this.progress.querySelector('.sr-progress-fill').style.width = `${((position + 1) / total) * 100}%`;
    const title = this.displayText(scene?.title);
    this.progress.querySelector('.sr-progress-label').textContent = title ? `${labels.sceneOf(position + 1, total)} · ${title}` : labels.sceneOf(position + 1, total);
  }
  /* A card in the chooser layer — the start and end cards. Resolves when it times out or a button
     is pressed, with that button's `data-card` value ('' for a timeout or a click on the
     card), or null when something else took over (start() or disable()), so its caller does nothing. */
  showCard(html, durationMs, scale = window.ScreenReelCore.timeScale()) {
    const layer = this.chooserLayer; if (!layer) return Promise.resolve('');
    layer.innerHTML = html; layer.hidden = false; layer.classList.add('sr-card-layer');
    return new Promise((resolve) => {
      const finish = (value) => { clearTimeout(timer); if (this.resolveCard === finish) this.resolveCard = null; layer.onclick = null; layer.hidden = true; layer.innerHTML = ''; layer.classList.remove('sr-card-layer'); resolve(value); };
      const timer = setTimeout(() => finish(''), durationMs * scale);
      this.resolveCard = finish;
      layer.onclick = (clickEvent) => { const button = clickEvent.target.closest?.('[data-card]'); finish(button ? button.dataset.card : ''); };
    });
  }
  /* Before the first scene of a run in video, clean video or autoplay: the flow's name and how it will play, so
     the viewer knows it has started. Any click skips it. */
  async showStartCard(scene) {
    const labels = this.labels(); const flow = this.store.activeFlow(); const scenes = this.current().scenes.length;
    const mode = labels[this.playMode(scene)] ?? '';
    await this.showCard(`<div class="sr-chooser sr-start-card" role="status"><h2>${esc(this.displayText(flow.name))}</h2><p>${esc(labels.startHint(mode, scenes))}</p></div>`, START_CARD_MS);
  }
  /* When the flow finishes: an end card with Replay and Close. Close (or the card timing out with
     `disableOnComplete`) ends the tour with reason 'complete'. Resolves 'replay', 'close', or ''. */
  showEndCard(scale) {
    const labels = this.labels(); const flow = this.store.activeFlow(); const scenes = this.current().scenes.length;
    return this.showCard(`<div class="sr-chooser sr-end-card" role="dialog" aria-labelledby="sr-end-title"><h2 id="sr-end-title">${esc(labels.finished)}: ${esc(this.displayText(flow.name))}</h2><p>${esc(labels.endHint(scenes))}</p><div class="sr-card-actions"><button type="button" class="sr-mode" data-card="replay">${esc(labels.replay)}</button><button type="button" class="sr-mode sr-mode--primary" data-card="close">${esc(labels.close)}</button></div></div>`, END_CARD_MS, scale);
  }
  /* Caption-style callouts (clean video, or any mode set to `callouts: 'caption'`): the card's words with no card, for as long
     as the card would have stayed up. */
  renderCaption(action) {
    const title = this.displayText(action.title); const body = this.displayText(action.text);
    this.caption.innerHTML = `${title ? `<strong>${esc(title)}</strong>` : ''}${body ? `<span>${esc(body)}</span>` : ''}`;
    this.caption.hidden = !(title || body);
  }
  async showCaption(action, signal) {
    if (!this.caption) return;
    this.renderCaption(action);
    try { await window.ScreenReelCore.sleep(window.ScreenReelCore.cardHoldMs(action), signal); } finally { if (this.caption) this.caption.hidden = true; }
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
    // Next continues a guided step when one is waiting; otherwise it moves to the next scene.
    if (command === 'prev') this.previous(); else if (command === 'next') { if (this.stepWaiter) this.stepWaiter(); else this.next(); } else if (command === 'play') { if (this.held) this.unhold(); else if (this.store.playing() && this.timedStep) this.hold(); else if (this.store.playing()) this.pause(); else this.play(); }
    else if (command === 'notes') { this.store.setNotesVisible(!this.store.notesVisible()); this.render(); }
    /* Unmuting is itself the user gesture the autoplay policy wants, so speak the current scene
       immediately — otherwise the viewer waits until the next scene to hear anything. */
    else if (command === 'sound') {
      const unmuting = this.store.muted(); this.store.setMuted(!unmuting);
      if (unmuting) {
        this.narrationBlocked = false; this.render(); const { scene } = this.current();
        // A step's file picks up where its clock is, so the words still land on their actions.
        if (this.stepAudio && this.store.playing() && !this.held) this.playStepAudio(this.stepAudio.url, this.stepAudio.clock ? this.stepAudio.clock.elapsed() : 0);
        else if (scene && this.store.playing() && !this.sceneHasAudio(scene)) this.narrate(scene);
      }
      // Muting silences the file; the step clock keeps running, so the timing is the same either way.
      else { window.__screenreelNarrator?.cancel(); window.__screenreelAudioNarrator?.stop(); this.render(); }
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
    const wasEnabled = this.store.enabled(); const { scene, position } = this.current(); const flowId = this.store.activeFlow()?.id; const origin = this.store.origin(); const mode = this.playMode(scene);
    document.removeEventListener('keydown', this.keyHandler); this.keyHandler = null;
    this.resolveChooser?.(null); this.resolveCard?.(null);
    this.pause(); this.restorePace(); this.startCardShown = false; this.undoTour(); this.store.setEnabled(false); this.store.clearRun(); this.reserveNotes(false); this.rootHost?.remove(); this.rootHost = null; this.shadow = null; this.pill = null; this.syncShield(); this.target.setAttribute('aria-pressed', 'false'); window.__screenreelCursor?.destroy(); window.__screenreelNarrator?.destroy(); window.__screenreelAudioNarrator?.destroy(); document.querySelectorAll('.sr-action-box,.sr-glow-box,.sr-dim-backdrop,.sr-action-callout,.sr-snippet,.sr-cursor-ring,.sr-choice-overlay').forEach((node) => node.remove()); event('modechange', { projectId: this.store.projectId, enabled: false });
    this.layer?.remove(); this.layer = null;
    if (wasEnabled) event('exit', { projectId: this.store.projectId, flowId, sceneId: scene?.id ?? null, position, reason, mode });
    if (wasEnabled && origin && this.options.restoreOnExit && (reason === 'user' || reason === 'complete')) this.restoreOrigin(origin);
    return this;
  }
  /* restoreOnExit: closing or finishing a tour takes the viewer back to where they started it —
     the same route and scroll position. A different route means a navigation (often a full page
     load), so the scroll rides along in the session and init() applies it on arrival. */
  restoreOrigin(origin) {
    if (this.routeMatches({ route: origin.route })) { scrollTo(origin.scrollX, origin.scrollY); return; }
    this.store.setPendingRestore({ scrollX: origin.scrollX, scrollY: origin.scrollY });
    // A hard navigation still reports the old URL until unload, so apply only once the route truly
    // matches (an SPA route change); otherwise the arriving page's init() applies it.
    this.navigate(origin.route).then(() => { if (this.routeMatches({ route: origin.route })) this.applyPendingRestore(); })
      .catch((error) => console.warn('[screenreel] could not return to where the tour started', error));
  }
  applyPendingRestore() {
    const pending = this.store.pendingRestore(); if (!pending) return;
    this.store.setPendingRestore(null);
    // Before `load` the page may not be tall enough yet, and the browser would clamp the scroll.
    const restore = () => scrollTo(pending.scrollX, pending.scrollY);
    if (document.readyState === 'complete') restore(); else addEventListener('load', restore, { once: true });
  }
  /* Guided tours are paced by the viewer (a mode's `keys` setting). Keys typed into the host's own controls — or the
     projector's buttons, found through the shadow boundary — are left alone. Esc is not a pacing key: see handleEscape. */
  handleKey(keyEvent) {
    if (keyEvent.key === 'Escape') { this.handleEscape(keyEvent); return; }
    if (keyEvent.key === PLAY_KEY) { this.handlePlayKey(keyEvent); return; }
    if (!this.store.playing() || !this.settings().keys) return;
    if (keyEvent.defaultPrevented || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
    const command = GUIDED_KEYS[keyEvent.key]; if (!command) return;
    const origin = keyEvent.composedPath?.()[0] || keyEvent.target;
    // From the tour's own card, arrows work too, but Enter is left to the focused button's native
    // click so it cannot fire twice.
    const inCard = !!origin?.closest?.('.sr-action-callout');
    if (inCard ? keyEvent.key === 'Enter' : origin?.closest?.(HOST_CONTROL_SELECTOR)) return;
    keyEvent.preventDefault(); this.command(command);
  }
  /* Esc ends the tour (reason 'user') in every mode, playing or paused, also from a host field the
     tour is typing in and from the start or end card. The chooser closes the same way (start()
     then ends the tour). Left alone: a key the host already handled (a dialog or menu that closes
     on Esc calls preventDefault, so the first Esc closes it and the next one ends the tour), a
     modified key, and a key pressed inside Studio, which owns Esc for its own modals. */
  handleEscape(keyEvent) {
    if (this.resolveChooser) { keyEvent.preventDefault(); this.resolveChooser(null); return; }
    if (keyEvent.defaultPrevented || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
    if (keyEvent.composedPath?.().some((node) => node?.classList?.contains?.('sr-studio'))) return;
    keyEvent.preventDefault(); this.disable('user');
  }
  /* Space presses the pill's Play/Pause, in any mode whose pill shows it (video, autoplay), paused or
     not, whatever `keys` says. Left alone: typing in a field, a modified key, a chooser or start/end
     card on screen, and a button or link of the tour's own (it activates natively). A focused host
     button would otherwise take the key, so it is the tour's while it runs. */
  handlePlayKey(keyEvent) {
    if (keyEvent.defaultPrevented || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey || keyEvent.shiftKey) return;
    if (this.resolveChooser || this.resolveCard || !this.visibleControls(this.store.share()).includes('play')) return;
    const origin = keyEvent.composedPath?.()[0] || keyEvent.target;
    if (origin?.closest?.(TEXT_ENTRY_SELECTOR) || origin?.isContentEditable) return;
    const ownControl = origin?.getRootNode?.() === this.shadow || !!origin?.closest?.(`#${window.ScreenReelCore.LAYER_ID}`);
    if (ownControl && origin?.closest?.(HOST_CONTROL_SELECTOR)) return;
    keyEvent.preventDefault(); this.command('play');
  }
  /* Overlays a scene handed over (see settleOverlays in the runtime) go when the scene is left. */
  releaseOverlays() {
    const releases = [...this.stepReleases, ...this.timedReleases, ...this.retained]; this.stepReleases = []; this.timedReleases = []; this.retained = [];
    releases.forEach((release) => release());
  }
  /* A guided callout mid-scene holds the scene until Next. Pause, Back, and Exit resolve it too; the
     play loop's generation check then stops the scene. */
  waitForStep() { return new Promise((resolve) => { this.stepWaiter = () => { this.stepWaiter = null; resolve(); this.render(); }; this.render(); }); }
  /* Automatic cleanup. `journal` holds, newest last, the undo for every change the tour made in
     this document: { sceneId, action }, where action is an ordinary action (see inverseFor and
     pairedUndo in the runtime). A scene cut short undoes its own entries; closing or finishing the
     tour undoes all of them. A scene that plays through keeps its changes, so the next scene can
     build on them. */
  /* Undo and cleanup actions run to completion, quietly: no cursor, no narration, no abort signal,
     because a half-undone app is exactly the state they exist to prevent. A target that is gone is
     given up on quickly (core quietAction), so a scene change is not held up by a closed dialog. */
  quietContext() { return { document, window, resolveFunction: (name) => this.resolveFunction(name), strictFunctions: this.strictFunctions(), variables: this.variablesFor(), warn: (message) => console.warn('[screenreel]', message) }; }
  async runQuietly(actions, what) {
    for (const action of actions) {
      const result = await window.ScreenReelCore.runAction(window.ScreenReelCore.quietAction(action), this.quietContext());
      if (!result.ok) console.warn(`[screenreel] ${what}: ${action.type} ${action.selector || ''} failed`);
    }
  }
  undoJournal(matches, what) {
    const entries = this.journal.filter(matches); this.journal = this.journal.filter((entry) => !matches(entry));
    return this.runQuietly(entries.reverse().map((entry) => entry.action), what);
  }
  undoTour() { const undo = () => this.undoJournal(() => true, 'undoing the tour'); this.leaving = this.leaving.then(undo, undo); return this.leaving; }
  /* Everything a scene leaves behind is dealt with here, whatever ended it: next, back, exit, pause,
     a choice jump, or navigation. A scene cut short undoes its journal; `scene.cleanup` always runs,
     as the author's explicit escape hatch. */
  async leaveScene(reason) {
    this.stopTimedStep(); this.releaseOverlays();
    const scene = this.runningScene; const finished = this.runningSceneFinished;
    this.runningScene = null; this.runningSceneFinished = false;
    if (!scene) return;
    const interrupted = INTERRUPTING_REASONS.has(reason) || (reason === 'next' && !finished);
    if (interrupted) await this.undoJournal((entry) => entry.sceneId === scene.id, `undoing scene ${scene.id} (${reason})`);
    await this.runQuietly(scene.cleanup || [], `cleanup leaving scene ${scene.id} (${reason})`);
  }
  /* Controls inside a guided callout: step count, Skip, Back (from the second step), Next. */
  calloutControls(scene, actionIndex) {
    const labels = this.labels(); const { step, total } = window.ScreenReelCore.infoCardStep(this.current().scenes, scene.id, actionIndex);
    return {
      labels: { skip: labels.skip, back: labels.back, next: step === total ? labels.finish : labels.next },
      step: labels.stepOf(step, total),
      onSkip: () => this.disable('user'),
      onBack: step > 1 ? () => this.command('prev') : null,
      onNext: () => this.command('next'),
      focusNext: true,
    };
  }
  /* Start a flow at a scene: the entry point for hosts that launch tours themselves (onboarding,
     a help menu). `mode` is 'video', 'clean', 'autoplay', 'guided', or 'ask' (show the chooser); without it
     the configuration decides (docs/playback.md#which-mode-plays). Throws on an unknown flow, mode,
     or position, or a mode the host's `playback.modes` excludes, rather than guessing. */
  async start(flowId, { position = 0, mode } = {}) {
    const playback = window.ScreenReelPlayback;
    const flow = this.store.getFlow(flowId); if (!flow) throw new Error(`ScreenReel start(): unknown flow "${flowId}"`);
    const requested = mode == null ? null : playback.modeName(mode, { allowAsk: true });
    if (mode != null && !requested) throw new Error(`ScreenReel start(): mode must be ${[...playback.MODES, playback.ASK].join(', ')}, got "${mode}"`);
    if (requested && requested !== playback.ASK && this.playback.modes && !this.playback.modes.includes(requested)) throw new Error(`ScreenReel start(): mode "${requested}" is not in this host's playback.modes (${this.playback.modes.join(', ')})`);
    const sceneCount = this.store.enabledScenes(flow).length;
    if (!Number.isInteger(position) || position < 0 || position >= sceneCount) throw new Error(`ScreenReel start(): position ${position} is outside the ${sceneCount} enabled scenes of "${flowId}"`);
    this.pause(); await this.undoTour(); this.resolveCard?.(null);
    this.store.setActive(flow.id); this.store.setPosition(position); this.store.setAdvanceChoice(null); this.startCardShown = false;
    this.store.setOrigin({ route: this.router.getRoute(), scrollX, scrollY });
    if (this.store.enabled()) this.render(); else this.enable();
    const remembered = this.playback.remember ? this.store.playbackPick(flow.id) : null;
    const plan = playback.resolveMode({ flow: playback.flowConfig(flow), mount: this.playback, requested, canAsk: !this.store.share(), remembered });
    let chosen = plan.mode;
    if (plan.ask) {
      chosen = await this.chooseMode(flow, plan.offered, plan.preselect);
      if (!chosen) { this.disable('user'); return this; }
      if (this.playback.remember) this.store.setPlaybackPick(flow.id, chosen);
    }
    // A mode someone picked (start()'s `mode`, the chooser, a remembered pick) holds for the whole
    // run; a configured one is re-read per scene, so a scene's own `advance` still applies.
    const picked = plan.ask || plan.source === 'start' || plan.source === 'remembered';
    this.store.setAdvanceChoice(picked ? chosen : null); this.store.setPlaying(true);
    event('start', { projectId: this.store.projectId, flowId: flow.id, position, mode: chosen, source: plan.ask ? 'chooser' : plan.source });
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
  /* The flow's end. With the mode's `endCard`, the end card shows first: Replay starts the flow again
     in the same mode, Close ends the tour as complete, and when it times out the tour ends only with
     `disableOnComplete`, as it always has. */
  complete() {
    const settings = this.settings(); const mode = this.playMode();
    // Replay keeps what the viewer (or start()) picked; a configured run re-resolves, so scene `advance` still applies.
    const picked = window.ScreenReelPlayback.modeName(this.store.advanceChoice());
    const cardScale = settings.pace ?? (Number(this.options.timeScale) || 1); // read before restorePace() drops the mode's pace
    this.pause(); this.undoTour(); this.restorePace(); this.startCardShown = false;
    const { scene, position, scenes } = this.current(); const flowId = this.store.activeFlow().id;
    this.analytics.emit('flow_complete'); event('complete', { projectId: this.store.projectId, flowId, sceneId: scene?.id, position, sceneCount: scenes.length, mode });
    if (!settings.endCard) { if (this.options.disableOnComplete) this.disable('complete'); return this; }
    this.showEndCard(cardScale).then((choice) => {
      if (choice === null) return null;
      if (choice === 'replay') return this.start(flowId, picked ? { mode: picked } : {});
      if (choice === 'close' || this.options.disableOnComplete) this.disable('complete');
      return null;
    }).catch((error) => console.warn('[screenreel] end card failed', error));
    return this;
  }
  /* A mode's `pace` sets the time scale for its run; leaving the run puts the host's back. */
  applyPace(settings) {
    if (settings.pace == null) return;
    window.ScreenReelCore.setTimeScale(settings.pace); this.paceApplied = true;
  }
  restorePace() {
    if (!this.paceApplied) return;
    window.ScreenReelCore.setTimeScale(this.options.timeScale); this.paceApplied = false;
  }
  validateScene(sceneId) {
    const flow = this.store.activeFlow(); const scene = sceneId ? flow.scenes.find((item) => item.id === sceneId) : this.current().scene;
    if (!scene) return { ok: false, flowId: flow.id, sceneId: sceneId || null, route: null, sceneErrors: ['Scene not found'], actions: [] };
    const sceneErrors = []; if (!this.routeMatches(scene)) sceneErrors.push(`Current route does not match ${scene.route}`);
    if (scene.waitFor) { try { if (!document.querySelector(scene.waitFor)) sceneErrors.push(`waitFor has no matches: ${scene.waitFor}`); } catch { sceneErrors.push(`waitFor is invalid: ${scene.waitFor}`); } }
    const timing = window.ScreenReelStepClock.validateTimedSteps(scene.actions);
    const actions = (scene.actions || []).map((action, actionIndex) => {
      const errors = window.ScreenReelCore.validate(action, document, location.href);
      timing.filter((problem) => problem.actionIndex === actionIndex).forEach((problem) => errors.push(problem.message));
      if (action.type === 'call' && !this.resolveFunction(action.fn) && (this.strictFunctions() || typeof window[action.fn] !== 'function')) errors.push(`Function is not registered: ${action.fn}`);
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
    if (this.held) { this.unhold(); return Promise.resolve(); }
    if (this.store.playing() && this.runningScene) { console.warn('[screenreel] play() ignored: a scene is already playing'); return Promise.resolve(); }
    // The pill shows Pause at once: the paused scene's cleanup (playScene awaits it) can take seconds.
    this.store.setPlaying(true); this.render();
    return this.playScene();
  }
  async playScene() {
    await this.leaving; // a previous scene's cleanup must finish before this one touches the app
    if (!this.store.playing()) return; // paused again while that cleanup ran
    const { scene } = this.current(); if (!scene) return; const generation = ++this.playGeneration; clearTimeout(this.timer); this.timer = null; this.store.setPlaying(true); this.render();
    if (!this.routeMatches(scene)) {
      const sameDocument = await this.navigate(scene.route);
      if (sameDocument && generation === this.playGeneration && this.store.playing() && this.routeMatches(scene)) return this.playScene();
      return;
    }
    this.runningScene = scene; this.runningSceneFinished = false;
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
    const settings = this.settings(scene); this.applyPace(settings);
    // The run's visible start: a title card once per run (video, autoplay), then the pill's intro beat.
    if (sceneIndex === 0 && settings.startCard && !this.startCardShown) { this.startCardShown = true; await this.showStartCard(scene); }
    if (generation !== this.playGeneration || !this.store.playing()) return;
    if (sceneIndex === 0) await this.introducePill();
    if (generation !== this.playGeneration || !this.store.playing()) return;
    // Narration starts with the scene's actions and runs alongside them, not before: the viewer
    // should hear the description of the thing while watching it happen. Deliberately not awaited.
    // A scene narrated by its cards' audio files is not also spoken: the two would talk over each other.
    if (!this.sceneHasAudio(scene)) this.narrate(scene);
    const cursorOn = this.options.cursor !== false && settings.cursor;
    /* Timed steps (docs/playback.md#timed-steps-and-narration-audio): a card with `stepMs` starts a
       step clock, the step's actions with `atMs` run on it, and the next card waits for the step's
       end. Autoplay and video play the timeline; a guided card waits for Next instead. */
    const timeline = window.ScreenReelStepClock.planSteps(scene.actions);
    const timedMode = settings.callouts !== 'step';
    const stopped = () => generation !== this.playGeneration || !this.store.playing();
    for (let actionIndex = 0; actionIndex < (scene.actions || []).length; actionIndex++) {
      const action = scene.actions[actionIndex];
      if (stopped()) break;
      const callout = window.ScreenReelCore.isGuidedStep(action);
      const place = timeline[actionIndex];
      // A timed step ends (its stepMs, then its audio, capped) before the next card shows, and before
      // an action with no atMs runs: that action is a gate (a waitFor, say) and is not part of the step.
      if (this.timedStep && place.owner !== this.timedStep.index) { await this.finishTimedStep(); if (stopped()) break; }
      await this.whileHeld(); if (stopped()) break;
      const startsStep = timedMode && callout && place.owner === actionIndex;
      const inStep = !callout && this.timedStep?.index === place.owner;
      if (startsStep) this.startTimedStep(action, actionIndex);
      else if (inStep && place.atMs != null) { await this.timedStep.clock.waitUntil(place.atMs, this.controller.signal); if (stopped()) break; }
      const clock = (startsStep || inStep) ? this.timedStep.clock.state() : null;
      event('step', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene.id, sceneIndex, sceneTitle: scene.title, actionIndex, total: (scene.actions || []).length, action, stepMs: clock?.stepMs ?? null, atMs: inStep ? place.atMs : null, elapsedMs: clock?.elapsedMs ?? null });
      let navigationSameDocument = false; let priorPosition = null;
      /* The mode's `callouts` setting decides how an info card plays. 'step' (guided): it skips its
         hold and waits for Next at once, so the card's buttons are never live while nothing is
         listening; everything else plays through. 'timed': it holds for its reading time. 'caption':
         its words show as a caption, no card. 'off': it is skipped. A card that starts a timed step
         never holds: it stays up until the step ends (with its caption), however many actions run meanwhile. */
      if (callout && settings.callouts === 'off') continue;
      if (callout && settings.callouts === 'caption') { if (startsStep) this.showTimedCaption(action); else await this.showCaption(action, this.controller.signal); continue; }
      const step = callout && settings.callouts === 'step';
      const holder = step ? this.stepReleases : startsStep ? this.timedReleases : this.retained;
      /* A timed card (with its ring) stays up for the whole step, whatever its actions do: it goes at
         the step's end (stopTimedStep) or when the next card starts. While the step's actions run the
         page is not dimmed, so a dialog they open is not darkened, and a card over an element an
         action works on fades (the runtime's actionTargets / onTarget hooks). */
      const timedRun = (startsStep || inStep) ? this.timedStep : null;
      const noDim = !!timedRun && place.stepActions > 0;
      const actedOn = new Set();
      // A guided card plays its file while it waits for Next.
      if (step && action.narrationAudio) { this.stepAudio = { url: this.audioUrl(action.narrationAudio), clock: null }; this.playStepAudio(this.stepAudio.url); }
      this.raiseLayer(); // the previous action may have opened a host pop-up over the tour
      // A toggle-style click is undone by the scene's own later click on the same element: journal that
      // pair now, and drop the entry once the pair has run for real.
      this.journal = this.journal.filter((entry) => !(entry.sceneId === scene.id && entry.pairIndex === actionIndex));
      const result = await window.ScreenReelCore.runAction(action, {
        document, window, signal: this.controller.signal, resolveFunction: (name) => this.resolveFunction(name), strictFunctions: this.strictFunctions(),
        variables: this.variablesFor(),
        // The executor already calls these at every interaction site; supplying them is what makes
        // the agent cursor visible during a live tour instead of a no-op.
        moveCursor: cursorOn ? async (el) => { if (el) await this.cursor()?.moveTo(el)?.catch?.(() => {}); } : undefined,
        pressCursor: cursorOn ? async () => { await this.cursor()?.press()?.catch?.(() => {}); } : undefined,
        scrollCursor: cursorOn ? (direction) => this.cursor()?.startBob(direction) : undefined,
        stopScrollCursor: cursorOn ? () => this.cursor()?.stopBob() : undefined,
        // An action's line REPLACES whatever is currently speaking (speak() cancels in flight):
        // a queue would drift behind the visuals, and the words must land on what is on screen.
        // narrator() is null when the viewer muted or the host opted out, so this stays silent.
        // A card with its own audio file is not also spoken: its `narration` is the file's transcript.
        narrateAction: (text) => { if (!(callout && action.narrationAudio)) this.narrator()?.speak(text); },
        navigate: async (route) => {
          // Navigation actions are terminal: persist the next scene before a hard navigation can unload this document.
          await this.leaveScene('navigate');
          const { scenes, position } = this.current(); priorPosition = position;
          if (position >= scenes.length - 1 && this.options.loop === false) this.complete(); else this.advancePosition();
          try { navigationSameDocument = await this.navigate(route); } catch (error) { this.store.setPosition(priorPosition); this.render(); throw error; }
        },
        dim: settings.dim ? this.options.dim : false,
        noDim: noDim || undefined,
        actionTargets: startsStep ? () => [...(timedRun?.targets || [])] : undefined,
        onTarget: inStep ? (el) => { actedOn.add(el); timedRun.targets.add(el); } : undefined,
        persist: step || startsStep, skipHold: step || startsStep, retain: (release) => holder.push(release),
        journal: (undo) => this.journal.push({ sceneId: scene.id, action: undo }),
        calloutControls: step ? this.calloutControls(scene, actionIndex) : undefined,
        // Notes are presenter captions (the mode's `notes`); a guided tour's card already carries the words.
        announce: settings.notes ? (message) => this.toast(message) : undefined,
        warn: (message) => { console.warn('[screenreel]', message); this.toast(message); },
      });
      actedOn.forEach((el) => timedRun?.targets.delete(el));
      if (stopped()) break; // exit, pause or next during the action: it stopped part way (error 'aborted')
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
      const pairIndex = result.ok ? window.ScreenReelCore.pairedUndo(scene.actions, actionIndex) : -1;
      if (pairIndex >= 0) this.journal.push({ sceneId: scene.id, pairIndex, action: scene.actions[pairIndex] });
      this.raiseLayer();
      if (step && result.ok && generation === this.playGeneration && this.store.playing()) {
        event('awaitingnext', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene.id, actionIndex });
        await this.waitForStep();
        if (action.narrationAudio) this.stopStepAudio(); // Next (or Back, Skip) ends the card's audio
        const released = this.stepReleases; this.stepReleases = []; released.forEach((release) => release());
      }
    }
    if (stopped()) return;
    const endsTimed = !!this.timedStep;
    if (endsTimed) { await this.finishTimedStep(); if (stopped()) return; }
    this.runningSceneFinished = true; // every action ran: leaving now is moving on, not cutting it short
    /* Hold the scene until narration finishes rather than cutting a sentence mid-word. Capture
       solves the same overrun by freezing the last frame (voice.overflow: 'extend'); a live
       product cannot be frozen, so the wait happens here instead — bounded, so one long note can
       never stall the tour. Scenes with no narration are unaffected. */
    await this.narrator()?.settle(Number(scene.narrationCapMs) || undefined);
    if (generation !== this.playGeneration || !this.store.playing()) return;
    this.analytics.emit('scene_complete');
    // A scene that ends on a timed step has had its rest inside stepMs: only its own dwellMs adds to it.
    const delay = Number(scene.dwellMs ?? (endsTimed ? 0 : this.store.activeFlow().defaults?.dwellMs ?? DEFAULT_DWELL_MS)); this.timer = setTimeout(() => this.next(true, generation), delay);
  }
  sceneHasAudio(scene) { return (scene?.actions || []).some((action) => window.ScreenReelCore.isGuidedStep(action) && action.narrationAudio); }
  /* A timed step's state: { index, stepMs, clock, audioUrl, caption, targets (elements its actions are working on) }. One at a time; a card that
     starts a step replaces the previous one, which finishTimedStep has already ended. */
  startTimedStep(action, index) {
    this.stopTimedStep();
    const clock = window.ScreenReelStepClock.createStepClock().start(action.stepMs);
    const audioUrl = this.audioUrl(action.narrationAudio);
    this.timedStep = { index, stepMs: action.stepMs, clock, audioUrl, caption: false, targets: new Set() };
    if (audioUrl) { this.stepAudio = { url: audioUrl, clock }; this.playStepAudio(audioUrl); }
  }
  showTimedCaption(action) {
    if (!this.caption || !this.timedStep) return;
    this.renderCaption(action); this.timedStep.caption = true;
  }
  releaseTimedCard() { const releases = this.timedReleases; this.timedReleases = []; releases.forEach((release) => release()); }
  /* The step's end: t0 + stepMs, then, if its audio still plays, until it ends, but never more than
     AUDIO_OVERRUN_CAP_MS past stepMs. Both waits are on the step clock, so a pause holds them too. */
  async finishTimedStep() {
    const timed = this.timedStep; if (!timed) return;
    const signal = this.controller?.signal;
    await timed.clock.waitUntil(timed.stepMs, signal);
    const audio = window.__screenreelAudioNarrator;
    if (this.timedStep === timed && !signal?.aborted && timed.audioUrl && audio?.playing() && audio.url() === timed.audioUrl) {
      await Promise.race([audio.settle(), timed.clock.waitUntil(timed.stepMs + window.ScreenReelStepClock.AUDIO_OVERRUN_CAP_MS, signal)]);
    }
    if (this.timedStep === timed) this.stopTimedStep();
  }
  /* Ends the running timed step at once: its clock (releasing every wait on it), its card, caption,
     audio, and any hold. Called at a step's natural end and whenever the scene is left. */
  stopTimedStep() {
    const timed = this.timedStep; this.timedStep = null;
    timed?.clock.stop();
    if (timed?.caption && this.caption) this.caption.hidden = true;
    this.releaseTimedCard(); this.stopStepAudio();
    const held = this.held; this.held = null; held?.resolve();
  }
  /* The pill's pause inside a timed step holds the step in place instead of cutting the scene short:
     the clock and the audio pause, an action already moving finishes, and the next one waits. Play
     continues both from where they were. Anything else (Next, Back, Exit) ends the step as usual. */
  hold() {
    const timed = this.timedStep; if (!timed || this.held) return;
    let resolve; const promise = new Promise((done) => { resolve = done; });
    this.held = { promise, resolve };
    timed.clock.pause(); window.__screenreelAudioNarrator?.pause();
    event('hold', { projectId: this.store.projectId, flowId: this.store.activeFlow()?.id, held: true, ...timed.clock.state() });
    this.render();
  }
  unhold() {
    const held = this.held; if (!held) return;
    this.held = null;
    const timed = this.timedStep; timed?.clock.resume();
    const audio = window.__screenreelAudioNarrator;
    if (timed?.audioUrl && audio?.playing() && audio.url() === timed.audioUrl) audio.resume();
    else if (timed?.audioUrl && this.stepAudio) this.playStepAudio(timed.audioUrl, timed.clock.elapsed()); // unmuted while held
    held.resolve();
    if (timed) event('hold', { projectId: this.store.projectId, flowId: this.store.activeFlow()?.id, held: false, ...timed.clock.state() });
    this.render();
  }
  whileHeld() { return this.held ? this.held.promise : Promise.resolve(); }
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
  pause() { this.playGeneration++; this.stepWaiter?.(); this.leaving = this.leaveScene('pause').catch((error) => console.warn('[screenreel] scene cleanup failed', error)); this.store.setPlaying(false); this.controller?.abort(); clearTimeout(this.timer); this.timer = null; window.__screenreelCursor?.stopBob(); window.__screenreelNarrator?.cancel(); this.stopStepAudio(); this.render(); return this; }
  async next(autoPlay = false, expectedGeneration = null) {
    if (expectedGeneration != null && expectedGeneration !== this.playGeneration) return;
    // The last scene of a non-looping flow has nowhere to go: Next — the timer's or the viewer's — completes it.
    const current = this.current(); if (this.options.loop === false && current.position >= current.scenes.length - 1) return this.complete();
    const shouldPlay = autoPlay || this.store.playing();
    const generation = ++this.playGeneration; this.stepWaiter?.(); this.controller?.abort(); clearTimeout(this.timer); this.timer = null;
    this.leaving = this.leaveScene('next'); await this.leaving;
    if (generation !== this.playGeneration) return; // another command arrived during cleanup
    const scene = this.advancePosition(); if (!scene) return;
    if (!this.routeMatches(scene)) {
      const sameDocument = await this.navigate(scene.route);
      if (sameDocument && generation === this.playGeneration && shouldPlay && this.store.playing() && this.routeMatches(scene)) return this.playScene();
    } else if (shouldPlay && this.store.playing()) return this.playScene();
  }
  /* Back goes to the previous scene. A presenter's pill (the older look) pauses there. A viewer's —
     guided, or any mode configured with `playback` — plays it, the way a viewer expects, and does
     nothing on the first scene rather than wrapping to the end of the tour. */
  async previous() {
    const { scenes, position } = this.current(); if (!scenes.length) return;
    const settings = this.settings();
    const replays = (settings.mode === 'guided' || !settings.legacy) && this.store.playing();
    if (replays && position === 0) return;
    this.pause();
    const target = (position - 1 + scenes.length) % scenes.length; this.store.setPosition(target); this.render();
    // Going back replays that scene, so its changes are undone first; toggles must not apply twice.
    const undoTarget = () => this.undoJournal((entry) => entry.sceneId === scenes[target].id, `undoing scene ${scenes[target].id} to replay it`);
    this.leaving = this.leaving.then(undoTarget, undoTarget);
    if (replays) { this.store.setPlaying(true); return this.playScene(); }
    if (!this.routeMatches(scenes[target])) await this.router.navigate(scenes[target].route);
  }
  captureCurrent() {
    let flow = this.store.activeFlow(); if (flow.readonly) flow = this.store.createCopy(flow, `My ${flow.name}`);
    const route = window.ScreenReelCore.normalizeRoute(this.router.getRoute(), location.href) || '/'; const scene = { id: window.ScreenReelStore.makeId('scene'), enabled: true, route, title: document.title || 'Captured scene', talkingPoints: '', dwellMs: window.ScreenReelStore.NEW_FLOW_DEFAULTS.dwellMs, actions: [] };
    flow.scenes.push(scene); flow = this.store.save(flow); this.toast('Scene captured locally'); this.openStudio({ flowId: flow.id, sceneId: scene.id });
  }
  // Authoring pauses the tour: its click shield (in the top layer) would otherwise cover Studio.
  async openStudio(selection = {}) { if (this.store.playing()) this.pause(); const module = await import(this.assetUrl('studio.js')); return module.openStudio({ projector: this, store: this.store, assetBase: this.assetBase, assetVersion: this.assetVersion, ...selection }); }
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
      this.instance = await publicApi.mount(button, { projectId: this.getAttribute('project-id') || 'screenreel', assetBase: this.getAttribute('asset-base') || assetBase, flow: data ? { data } : { src: this.getAttribute('flow-src') }, notesMode: this.getAttribute('notes-mode') || 'reserve', loop: this.getAttribute('loop') !== 'false', strict: this.hasAttribute('strict'), ...(this.hasAttribute('advance') ? { advance: this.getAttribute('advance') } : {}), ...(this.hasAttribute('playback-mode') ? { playback: { force: this.getAttribute('playback-mode') } } : {}), ...(this.getAttribute('studio') === 'false' ? { studio: false } : {}), ...(this.hasAttribute('position') ? { position: this.getAttribute('position') } : {}), ...(this.getAttribute('shield') === 'false' ? { shield: false } : {}) });
    }
    disconnectedCallback() { this.instance?.destroy(); this.instance = null; }
  }
  if (!customElements.get('screenreel-projector')) customElements.define('screenreel-projector', ScreenReelElement);
  return publicApi;
}
