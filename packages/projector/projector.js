import { icon } from './icons.js';

const instances = new Set();
const functions = new Map();
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
    this.target = target; this.options = { activationQueryParam: 'demo', notesMode: 'reserve', loop: true, strict: false, ...options }; this.assetBase = options.assetBase || assetBase; this.assetVersion = assetVersion;
    this.usesDefaultNavigation = !options.router?.navigate; this.router = { ...defaultRouter(), ...(options.router || {}) }; this.controller = null; this.timer = null; this.playGeneration = 0; this.originalPadding = null; this.rootHost = null; this.shadow = null;
    this.store = new window.ScreenReelStore.Store({ projectId: options.projectId, flow: options.flow, baseHref: location.href, legacyStorage: options.legacyStorage });
  }
  assetUrl(name) { const url = new URL(name, this.assetBase); if (this.assetVersion) url.search = this.assetVersion; return url.href; }
  async init() {
    await this.store.ready(); this.parseActivation(); this.bindTarget(); this.unsubscribe = this.router.subscribe?.(() => this.render());
    if (this.store.enabled() && !new URLSearchParams(location.search).has('screenreelPreview')) { this.enable(false); if (this.store.playing()) queueMicrotask(() => this.play()); } instances.add(this); event('ready', { projectId: this.store.projectId }); return this;
  }
  bindTarget() {
    this.clickHandler = () => this.store.enabled() ? this.disable() : this.enable(); this.target.addEventListener('click', this.clickHandler); this.target.setAttribute('aria-pressed', String(this.store.enabled()));
  }
  parseActivation() {
    const value = new URLSearchParams(location.search).get(this.options.activationQueryParam);
    if (value === '1') this.store.setEnabled(true); if (value === '0') { this.store.setEnabled(false); this.store.clearRun(); }
  }
  mountUi() {
    if (this.rootHost) return;
    this.rootHost = document.createElement('div'); this.rootHost.id = `screenreel-projector-${this.store.projectId}`; document.body.appendChild(this.rootHost); this.shadow = this.rootHost.attachShadow({ mode: 'open' });
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = this.assetUrl('screenreel.css'); this.shadow.appendChild(link);
    const shell = document.createElement('div'); shell.className = 'sr-shell'; shell.innerHTML = '<div class="sr-pill" role="toolbar" aria-label="ScreenReel projector"></div><section class="sr-notes" hidden></section><div class="sr-toast" hidden></div>'; this.shadow.appendChild(shell);
    this.pill = shell.querySelector('.sr-pill'); this.notes = shell.querySelector('.sr-notes'); this.toastNode = shell.querySelector('.sr-toast'); this.render();
  }
  render() {
    if (!this.pill) return; const flow = this.store.activeFlow(); const scenes = this.store.enabledScenes(flow); const position = Math.min(this.store.position(), Math.max(0, scenes.length - 1)); const scene = scenes[position];
    this.pill.innerHTML = `<select class="sr-flow" aria-label="Active demo flow">${this.store.allFlows().map((item) => `<option value="${esc(item.id)}"${item.id === flow.id ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select><span class="sr-count">${scenes.length ? position + 1 : 0}/${scenes.length}</span><button data-cmd="prev" title="Previous scene">${icon('left')}</button><button data-cmd="play" class="sr-play" title="${this.store.playing() ? 'Pause' : 'Play'}">${icon(this.store.playing() ? 'pause' : 'play')}</button><button data-cmd="next" title="Next scene">${icon('right')}</button><button data-cmd="notes" class="${this.store.notesVisible() ? 'active' : ''}" title="Presenter notes">${icon('notes')}</button><button data-cmd="capture" title="Capture this page as a scene">${icon('capture')}</button><button data-cmd="studio" title="Open ScreenReel Studio">${icon('studio')}</button><button data-cmd="exit" title="Exit demo mode">${icon('close')}</button>`;
    this.pill.querySelector('.sr-flow').onchange = (e) => { this.pause(); this.store.setActive(e.target.value); this.store.setPosition(0); this.render(); };
    this.pill.querySelectorAll('[data-cmd]').forEach((button) => { button.onclick = () => this.command(button.dataset.cmd); });
    this.target.setAttribute('aria-pressed', String(this.store.enabled())); this.renderNotes(scene);
  }
  renderNotes(scene) {
    const visible = this.store.notesVisible() && !!scene; this.notes.hidden = !visible;
    if (visible) { this.notes.innerHTML = `<div><span>Talking points</span><strong>${esc(scene.title)}</strong></div><p>${esc(scene.talkingPoints || 'No talking points yet.')}</p><button data-edit>Edit scene</button>`; this.notes.querySelector('[data-edit]').onclick = () => this.openStudio({ flowId: this.store.activeFlow().id, sceneId: scene.id }); this.reserveNotes(true); }
    else this.reserveNotes(false);
  }
  reserveNotes(visible) {
    if (this.options.notesMode !== 'reserve') return;
    if (visible && this.originalPadding == null) { this.originalPadding = document.body.style.paddingBottom; document.body.style.paddingBottom = 'clamp(88px, 10vh, 136px)'; }
    if (!visible && this.originalPadding != null) { document.body.style.paddingBottom = this.originalPadding; this.originalPadding = null; }
  }
  command(command) {
    if (command === 'prev') this.previous(); else if (command === 'next') this.next(); else if (command === 'play') this.store.playing() ? this.pause() : this.play();
    else if (command === 'notes') { this.store.setNotesVisible(!this.store.notesVisible()); this.render(); }
    else if (command === 'capture') this.captureCurrent(); else if (command === 'studio') this.openStudio(); else if (command === 'exit') this.disable();
  }
  toast(message) { if (!this.toastNode) return; this.toastNode.textContent = message; this.toastNode.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { this.toastNode.hidden = true; }, 2600); }
  enable(emit = true) { this.store.setEnabled(true); this.target.setAttribute('aria-pressed', 'true'); this.mountUi(); if (emit) event('modechange', { projectId: this.store.projectId, enabled: true }); return this; }
  disable() { this.pause(); this.store.setEnabled(false); this.store.clearRun(); this.reserveNotes(false); this.rootHost?.remove(); this.rootHost = null; this.shadow = null; this.pill = null; this.target.setAttribute('aria-pressed', 'false'); document.querySelectorAll('.sr-action-box,.sr-glow-box,.sr-action-callout').forEach((node) => node.remove()); event('modechange', { projectId: this.store.projectId, enabled: false }); return this; }
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
    this.pause(); const { scene, position, scenes } = this.current(); event('complete', { projectId: this.store.projectId, flowId: this.store.activeFlow().id, sceneId: scene?.id, position, sceneCount: scenes.length }); return this;
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
  async play() {
    const { scene } = this.current(); if (!scene) return; const generation = ++this.playGeneration; clearTimeout(this.timer); this.timer = null; this.store.setPlaying(true); this.render();
    if (!this.routeMatches(scene)) {
      const sameDocument = await this.navigate(scene.route);
      if (sameDocument && generation === this.playGeneration && this.store.playing() && this.routeMatches(scene)) return this.play();
      return;
    }
    this.controller?.abort(); this.controller = new AbortController();
    if (scene.waitFor) {
      const ready = await window.ScreenReelCore.waitFor(document, scene.waitFor, 'visible', Number(scene.timeoutMs) || 8000, this.controller.signal);
      if (!ready) {
        const result = { ok: false, error: `Scene readiness timed out: ${scene.waitFor}` };
        console.warn('[screenreel]', result.error); if (this.options.strict) return this.actionFailed(scene, { id: null, type: 'waitFor', selector: scene.waitFor }, -1, result);
      }
    }
    if (scene.settleMs && generation === this.playGeneration && this.store.playing()) await window.ScreenReelCore.sleep(Number(scene.settleMs), this.controller.signal);
    if (generation !== this.playGeneration || !this.store.playing()) return;
    for (let actionIndex = 0; actionIndex < (scene.actions || []).length; actionIndex++) {
      const action = scene.actions[actionIndex];
      if (generation !== this.playGeneration || !this.store.playing()) break;
      let navigationSameDocument = false; let priorPosition = null;
      const result = await window.ScreenReelCore.runAction(action, {
        document, window, signal: this.controller.signal, resolveFunction: (name) => functions.get(name),
        navigate: async (route) => {
          // Navigation actions are terminal: persist the next scene before a hard navigation can unload this document.
          const { scenes, position } = this.current(); priorPosition = position;
          if (position >= scenes.length - 1 && this.options.loop === false) this.complete(); else this.advancePosition();
          try { navigationSameDocument = await this.navigate(route); } catch (error) { this.store.setPosition(priorPosition); this.render(); throw error; }
        },
        warn: (message) => { console.warn('[screenreel]', message); this.toast(message); },
      });
      if (result.navigated) {
        const nextScene = this.current().scene;
        if (navigationSameDocument && generation === this.playGeneration && this.store.playing() && nextScene && this.routeMatches(nextScene)) return this.play();
        return;
      }
      if (!result.ok && this.options.strict) return this.actionFailed(scene, action, actionIndex, result);
    }
    if (generation !== this.playGeneration || !this.store.playing()) return; const delay = Number(scene.dwellMs ?? this.store.activeFlow().defaults?.dwellMs ?? 3000); this.timer = setTimeout(() => this.next(true, generation), delay);
  }
  pause() { this.playGeneration++; this.store.setPlaying(false); this.controller?.abort(); clearTimeout(this.timer); this.timer = null; this.render(); return this; }
  async next(autoPlay = false, expectedGeneration = null) {
    if (expectedGeneration != null && expectedGeneration !== this.playGeneration) return;
    const current = this.current(); if (autoPlay && this.options.loop === false && current.position >= current.scenes.length - 1) return this.complete();
    const shouldPlay = autoPlay || this.store.playing(); const scene = this.advancePosition(); if (!scene) return;
    const generation = ++this.playGeneration; this.controller?.abort(); clearTimeout(this.timer); this.timer = null;
    if (!this.routeMatches(scene)) {
      const sameDocument = await this.navigate(scene.route);
      if (sameDocument && generation === this.playGeneration && shouldPlay && this.store.playing() && this.routeMatches(scene)) return this.play();
    } else if (shouldPlay && this.store.playing()) return this.play();
  }
  async previous() { const { scenes, position } = this.current(); if (!scenes.length) return; this.pause(); const next = (position - 1 + scenes.length) % scenes.length; this.store.setPosition(next); this.render(); if (!this.routeMatches(scenes[next])) await this.router.navigate(scenes[next].route); }
  captureCurrent() {
    let flow = this.store.activeFlow(); if (flow.readonly) flow = this.store.createCopy(flow, `My ${flow.name}`);
    const route = window.ScreenReelCore.normalizeRoute(this.router.getRoute(), location.href) || '/'; const scene = { id: window.ScreenReelStore.makeId('scene'), enabled: true, route, title: document.title || 'Captured scene', talkingPoints: '', dwellMs: 6000, actions: [] };
    flow.scenes.push(scene); flow = this.store.save(flow); this.toast('Scene captured locally'); this.openStudio({ flowId: flow.id, sceneId: scene.id });
  }
  async openStudio(selection = {}) { const module = await import(this.assetUrl('studio.js')); return module.openStudio({ projector: this, store: this.store, assetBase: this.assetBase, assetVersion: this.assetVersion, ...selection }); }
  destroy() { this.disable(); this.target.removeEventListener('click', this.clickHandler); this.unsubscribe?.(); instances.delete(this); }
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
      const button = document.createElement('button'); button.className = 'sr-trigger'; button.title = 'Toggle ScreenReel demo'; button.setAttribute('aria-label', 'Toggle ScreenReel demo'); button.innerHTML = icon('presentation', 18); shadow.appendChild(button);
      let data; const inlineId = this.getAttribute('flow-data'); if (inlineId) { const node = document.getElementById(inlineId); if (node) data = JSON.parse(node.textContent); }
      this.instance = await publicApi.mount(button, { projectId: this.getAttribute('project-id') || 'screenreel', assetBase: this.getAttribute('asset-base') || assetBase, flow: data ? { data } : { src: this.getAttribute('flow-src') }, notesMode: this.getAttribute('notes-mode') || 'reserve', loop: this.getAttribute('loop') !== 'false', strict: this.hasAttribute('strict') });
    }
    disconnectedCallback() { this.instance?.destroy(); this.instance = null; }
  }
  if (!customElements.get('screenreel-projector')) customElements.define('screenreel-projector', ScreenReelElement);
  return publicApi;
}
