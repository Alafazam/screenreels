/* Browser-local ScreenReel manifest normalization and persistence. */
(function initScreenReelStore(root) {
  if (root.ScreenReelStore) return;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const makeId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`;

  function normalizeAction(action, sceneIndex, actionIndex) {
    const source = action && typeof action === 'object' ? clone(action) : {};
    const type = String(source.type || 'wait');
    return { ...source, id: String(source.id || `action_${sceneIndex + 1}_${actionIndex + 1}`), type, locked: source.locked === true || !root.ScreenReelCore?.supportedTypes.has(type) };
  }
  function normalizeScene(scene, index, baseHref) {
    const source = scene && typeof scene === 'object' ? clone(scene) : {}; const caption = source.caption || {};
    const route = root.ScreenReelCore?.normalizeRoute(source.route || '/', baseHref) || '/';
    return {
      ...source, id: String(source.id || `scene_${index + 1}`), enabled: source.enabled !== false, route,
      title: String(source.title ?? caption.title ?? `Scene ${index + 1}`),
      talkingPoints: String(source.talkingPoints ?? caption.body ?? source.sub ?? ''),
      actions: (source.actions || []).map((action, actionIndex) => normalizeAction(action, index, actionIndex)),
    };
  }
  function normalizeFlow(flow, index, baseHref, readonly = false) {
    if (!flow || typeof flow !== 'object' || !Array.isArray(flow.scenes)) return null;
    return {
      ...clone(flow), id: String(flow.id || `standard_${index + 1}`), name: String(flow.name || `Demo flow ${index + 1}`),
      readonly, createdAt: flow.createdAt || now(), updatedAt: flow.updatedAt || now(),
      defaults: clone(flow.defaults || { dwellMs: 6000, settleMs: 900 }), scenes: flow.scenes.map((scene, sceneIndex) => normalizeScene(scene, sceneIndex, baseHref)),
    };
  }
  function normalizeManifest(document, baseHref) {
    if (!document || typeof document !== 'object') throw new Error('Flow source is not a JSON object');
    let flows;
    if (Array.isArray(document.flows)) flows = document.flows;
    else if (Array.isArray(document.steps)) flows = [{ id: 'standard', name: document.name || 'Standard demo', defaults: document.defaults, scenes: document.steps }];
    else if (Array.isArray(document.scenes)) flows = [{ id: document.id || 'standard', name: document.name || 'Standard demo', defaults: document.defaults, scenes: document.scenes }];
    else throw new Error('Flow source must contain flows, scenes, or steps');
    const normalized = flows.map((flow, index) => normalizeFlow(flow, index, baseHref, true)).filter(Boolean);
    if (!normalized.length) throw new Error('Flow source contains no valid flows');
    return { schemaVersion: 1, flows: normalized };
  }

  class Store {
    constructor(options) {
      this.projectId = String(options.projectId || '').trim();
      if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(this.projectId)) throw new Error('projectId must be 2-80 letters, numbers, dots, underscores, or dashes');
      this.flowSource = options.flow; this.baseHref = options.baseHref || root.location?.href || 'http://screenreel.local/'; this.legacyStorage = options.legacyStorage;
      this.storage = options.storage || root.localStorage; this.session = options.sessionStorage || root.sessionStorage;
      this.prefix = `screenreel:${this.projectId}:`; this.standardFlows = []; this.recoveryNotice = '';
    }
    key(name) { return `${this.prefix}${name}:v1`; }
    sessionKey(name) { return `${this.prefix}session:${name}:v1`; }
    async ready() {
      let payload = this.flowSource?.data;
      if (!payload && this.flowSource?.src) {
        const response = await fetch(this.flowSource.src, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Unable to load ScreenReel flow (${response.status})`); payload = await response.json();
      }
      if (!payload) payload = { schemaVersion: 1, flows: [{ id: 'standard', name: 'Blank demo', scenes: [] }] };
      this.standardFlows = normalizeManifest(payload, this.baseHref).flows; this.migrateLegacy();
      return this;
    }
    migrateLegacy() {
      const legacy = this.legacyStorage; if (!legacy || this.storage.getItem(this.key('migration'))) return false;
      const localMap = { flowsKey: 'flows', activeFlowKey: 'active-flow', notesVisibleKey: 'notes-visible', enabledKey: 'enabled' };
      for (const [sourceName, targetName] of Object.entries(localMap)) { const sourceKey = legacy[sourceName]; const value = sourceKey ? this.storage.getItem(sourceKey) : null; if (value != null && this.storage.getItem(this.key(targetName)) == null) this.storage.setItem(this.key(targetName), value); }
      const sessionMap = { positionKey: 'position', playingKey: 'playing', navigationKey: 'navigation' };
      for (const [sourceName, targetName] of Object.entries(sessionMap)) { const sourceKey = legacy.session?.[sourceName]; const value = sourceKey ? this.session.getItem(sourceKey) : null; if (value != null && this.session.getItem(this.sessionKey(targetName)) == null) this.session.setItem(this.sessionKey(targetName), value); }
      this.storage.setItem(this.key('migration'), String(legacy.id || 'legacy')); return true;
    }
    readLocal() {
      try {
        const parsed = JSON.parse(this.storage.getItem(this.key('flows')) || '{"schemaVersion":1,"flows":[]}');
        if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.flows)) throw new Error('unsupported');
        return parsed.flows.map((flow, index) => normalizeFlow(flow, index, this.baseHref, false)).filter(Boolean);
      } catch {
        this.recoveryNotice = 'Saved ScreenReel data could not be read. A standard flow is active.'; return [];
      }
    }
    writeLocal(flows) { this.storage.setItem(this.key('flows'), JSON.stringify({ schemaVersion: 1, flows })); }
    allFlows() { return [...clone(this.standardFlows), ...clone(this.readLocal())]; }
    getFlow(id) { return this.allFlows().find((flow) => flow.id === id) || null; }
    activeFlow() { return this.getFlow(this.storage.getItem(this.key('active-flow'))) || clone(this.standardFlows[0]); }
    setActive(id) {
      const flow = this.getFlow(id) || this.standardFlows[0]; this.storage.setItem(this.key('active-flow'), flow.id);
      root.dispatchEvent?.(new CustomEvent('screenreel:flowchange', { detail: { projectId: this.projectId, flowId: flow.id } })); return clone(flow);
    }
    createCopy(source, name) {
      const flow = clone(source || this.activeFlow()); const stamp = now();
      flow.id = makeId('flow'); flow.name = name || `${flow.name} copy`; flow.readonly = false; flow.createdAt = stamp; flow.updatedAt = stamp;
      flow.scenes = flow.scenes.map((scene, sceneIndex) => ({ ...normalizeScene(scene, sceneIndex, this.baseHref), id: makeId('scene'), actions: scene.actions.map((action) => ({ ...action, id: makeId('action') })) }));
      return flow;
    }
    createBlank(name = 'New demo flow') { const stamp = now(); return { id: makeId('flow'), name, readonly: false, createdAt: stamp, updatedAt: stamp, defaults: { dwellMs: 6000, settleMs: 900 }, scenes: [] }; }
    save(flow) {
      if (flow.readonly || this.standardFlows.some((item) => item.id === flow.id)) throw new Error('Standard flows cannot be overwritten');
      const normalized = normalizeFlow(flow, 0, this.baseHref, false); normalized.updatedAt = now(); const flows = this.readLocal(); const index = flows.findIndex((item) => item.id === normalized.id);
      if (index >= 0) flows[index] = normalized; else flows.push(normalized); this.writeLocal(flows); this.setActive(normalized.id); return clone(normalized);
    }
    delete(id) { const flows = this.readLocal().filter((flow) => flow.id !== id); this.writeLocal(flows); if (this.storage.getItem(this.key('active-flow')) === id) this.setActive(this.standardFlows[0].id); }
    import(payload) {
      const manifest = normalizeManifest(payload, this.baseHref); const candidate = manifest.flows[0];
      if (this.getFlow(candidate.id)) { candidate.id = makeId('flow'); candidate.name += ' (imported)'; }
      candidate.readonly = false; candidate.createdAt = now(); return this.save(candidate);
    }
    export(flow) { return { schemaVersion: 1, exportedAt: now(), flows: [clone(flow)] }; }
    enabledScenes(flow = this.activeFlow()) { return flow.scenes.filter((scene) => scene.enabled !== false); }
    notesVisible() { return this.storage.getItem(this.key('notes-visible')) === '1'; }
    setNotesVisible(value) { value ? this.storage.setItem(this.key('notes-visible'), '1') : this.storage.removeItem(this.key('notes-visible')); }
    enabled() { return this.storage.getItem(this.key('enabled')) === '1'; }
    setEnabled(value) { value ? this.storage.setItem(this.key('enabled'), '1') : this.storage.removeItem(this.key('enabled')); }
    position() { return Math.max(0, Number(this.session.getItem(this.sessionKey('position'))) || 0); }
    setPosition(value) { this.session.setItem(this.sessionKey('position'), String(Math.max(0, value))); }
    playing() { return this.session.getItem(this.sessionKey('playing')) === '1'; }
    setPlaying(value) { value ? this.session.setItem(this.sessionKey('playing'), '1') : this.session.removeItem(this.sessionKey('playing')); }
    clearRun() { ['position', 'playing', 'navigation'].forEach((key) => this.session.removeItem(this.sessionKey(key))); }
    clearAll() {
      const keys = []; for (let index = 0; index < this.storage.length; index++) { const key = this.storage.key(index); if (key?.startsWith(this.prefix)) keys.push(key); } keys.forEach((key) => this.storage.removeItem(key));
      const sessionKeys = []; for (let index = 0; index < this.session.length; index++) { const key = this.session.key(index); if (key?.startsWith(this.prefix)) sessionKeys.push(key); } sessionKeys.forEach((key) => this.session.removeItem(key));
    }
    consumeRecoveryNotice() { const notice = this.recoveryNotice; this.recoveryNotice = ''; return notice; }
  }

  root.ScreenReelStore = { Store, normalizeManifest, normalizeFlow, normalizeScene, normalizeAction, clone, makeId };
})(globalThis);
