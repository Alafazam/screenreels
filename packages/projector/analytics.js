/* Session analytics for Projector playback. Nothing leaves the page by default: every enriched
   event is dispatched as a `screenreel:analytics` CustomEvent and handed to the integrator's
   onEvent callback; a network beacon fires only when the integrator configures beaconUrl.
   Payloads carry manifest identifiers (scene ids, indices) — no URLs, no page content, no PII. */

const SESSION_ID_KEY = 'analytics-id';
const VIEW_STARTED_KEY = 'analytics-view-started';

export function createAnalytics({ store, options = {}, dispatch, transport }) {
  const emitTargets = {
    dispatch: dispatch || ((name, detail) => window.dispatchEvent(new CustomEvent(`screenreel:${name}`, { detail }))),
    onEvent: typeof options.onEvent === 'function' ? options.onEvent : null,
    beaconUrl: typeof options.beaconUrl === 'string' && options.beaconUrl ? options.beaconUrl : null,
    // Injectable for tests; the default is the browser pair.
    transport: transport || {
      sendBeacon: (url, body) => navigator.sendBeacon?.(url, body),
      fetch: (url, init) => fetch(url, init),
    },
  };

  /* Stable per-run id, session-scoped like position/playing so it survives hard navigations. */
  function sessionId() {
    let id = store.session.getItem(store.sessionKey(SESSION_ID_KEY));
    if (!id) {
      id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : globalThis.ScreenReelStore.makeId('session');
      store.session.setItem(store.sessionKey(SESSION_ID_KEY), id);
    }
    return id;
  }

  function beacon(payload) {
    if (!emitTargets.beaconUrl) return;
    const body = JSON.stringify(payload);
    try {
      if (emitTargets.transport.sendBeacon(emitTargets.beaconUrl, body)) return;
    } catch { /* fall through to fetch */ }
    Promise.resolve(emitTargets.transport.fetch(emitTargets.beaconUrl, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body })).catch(() => {});
  }

  return {
    emit(eventName, detail = {}) {
      const flow = store.activeFlow();
      const scenes = store.enabledScenes(flow);
      const sceneIndex = Math.min(store.position(), Math.max(0, scenes.length - 1));
      const payload = {
        event: eventName,
        ts: Date.now(),
        sessionId: sessionId(),
        projectId: store.projectId,
        flowId: flow.id,
        sceneId: scenes[sceneIndex]?.id ?? null,
        sceneIndex,
        sceneCount: scenes.length,
        percentComplete: scenes.length ? Math.round(((sceneIndex + 1) / scenes.length) * 100) : 0,
        share: store.share(),
        ...detail,
      };
      emitTargets.dispatch('analytics', payload);
      try { emitTargets.onEvent?.(payload); } catch (error) { console.warn('[screenreel] analytics onEvent failed', error); }
      beacon(payload);
      return payload;
    },
    /* view_start must fire once per session even though play() re-runs after every navigation. */
    viewStarted() { return store.session.getItem(store.sessionKey(VIEW_STARTED_KEY)) === '1'; },
    markViewStarted() { store.session.setItem(store.sessionKey(VIEW_STARTED_KEY), '1'); },
  };
}
