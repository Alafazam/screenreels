/* ScreenReel live narrator: speaks each scene's script through the browser's speech engine while
   the tour plays in a real product.

   This is the live twin of Capture's voiceover (lib/voice.mjs), and both read the same field —
   `scene.narration ?? scene.talkingPoints`. They cannot be one implementation: Capture runs macOS
   `say` and muxes AAC into the MP4 with ffmpeg, none of which exists in a browser, and this speaks
   in the viewer's tab at playback time, which has no ffmpeg equivalent. test/narrator.test.mjs
   asserts the two script-selection functions agree, so the shared contract cannot drift silently.

   Globals are screenreel-prefixed so this never clashes with a host app's own tooling. */
(function initScreenReelNarrator(root) {
  if (root.__screenreelNarrator) return;

  const DEFAULT_RATE = 0.98;          // a touch under default; presenter-paced rather than clipped
  const VOICES_TIMEOUT_MS = 1500;     // Chrome populates getVoices() asynchronously
  const START_TIMEOUT_MS = 1200;      // no 'start' by now means the engine refused (autoplay block)
  const SETTLE_CAP_MS = 6000;         // hard ceiling so one long note can never stall the tour
  const WATCHDOG_SLACK_MS = 2000;     // Chrome sometimes drops 'end'; estimate + slack as backstop
  const MS_PER_CHAR = 62;             // rough speaking rate, only used to size the watchdog

  const synth = root.speechSynthesis;
  const Utterance = root.SpeechSynthesisUtterance;

  let settings = { rate: DEFAULT_RATE, voiceName: null, lang: null };
  let current = null;                 // { utterance, done: Promise, resolve, watchdog }
  let voicesReady = null;

  const available = () => Boolean(synth && Utterance);

  /* getVoices() is empty until the engine loads them, and 'voiceschanged' may never fire on
     browsers that already have them. Race the event against a timeout and take what we get. */
  function loadVoices() {
    if (!available()) return Promise.resolve([]);
    if (voicesReady) return voicesReady;
    voicesReady = new Promise((resolve) => {
      const existing = synth.getVoices();
      if (existing.length) return resolve(existing);
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); synth.removeEventListener?.('voiceschanged', finish); resolve(synth.getVoices()); };
      const timer = setTimeout(finish, VOICES_TIMEOUT_MS);
      synth.addEventListener?.('voiceschanged', finish);
    });
    return voicesReady;
  }

  /* Prefer an explicitly named voice, then a local voice for the page language, then anything for
     that language, then the engine default. A local voice keeps narration working offline. */
  function pickVoice(voices, { voiceName, lang }) {
    if (!voices.length) return null;
    if (voiceName) { const named = voices.find((voice) => voice.name === voiceName); if (named) return named; }
    const wanted = String(lang || root.document?.documentElement?.lang || 'en').toLowerCase();
    const prefix = wanted.split('-')[0];
    const matches = voices.filter((voice) => String(voice.lang || '').toLowerCase().startsWith(prefix));
    return matches.find((voice) => voice.localService) || matches[0] || null;
  }

  function clear() {
    if (!current) return;
    clearTimeout(current.watchdog);
    const finish = current.resolve; current = null; finish?.();
  }

  /* Rough spoken length. MS_PER_CHAR was calibrated at DEFAULT_RATE, so scale by the configured
     rate: at the default this is byte-identical to the old watchdog arithmetic. */
  const speechMs = (text, rate) => {
    const script = String(text ?? '').trim(); if (!script) return 0;
    const r = Number(rate) > 0 ? Number(rate) : (Number(settings.rate) > 0 ? Number(settings.rate) : DEFAULT_RATE);
    return Math.round(script.length * MS_PER_CHAR * (DEFAULT_RATE / r));
  };

  root.__screenreelNarrator = {
    available,
    estimateMs(text, rate) { return speechMs(text, rate); },
    settleCapMs: SETTLE_CAP_MS,
    configure(options = {}) {
      settings = { ...settings, ...options };
      if (settings.rate == null) settings.rate = DEFAULT_RATE;
      return this;
    },
    speaking() { return Boolean(current); },

    /* Start speaking `text`, replacing anything in flight. Resolves { spoke } once the engine has
       actually started — `spoke: false` means it refused, which in practice is the autoplay policy
       blocking audio before the viewer has interacted with the page. Callers use that to offer an
       unmute affordance rather than pretending narration is running. */
    async speak(text) {
      if (!available()) return { spoke: false, reason: 'unsupported' };
      const script = String(text ?? '').trim();
      this.cancel();
      if (!script) return { spoke: false, reason: 'empty' };

      const voices = await loadVoices();
      const utterance = new Utterance(script);
      utterance.rate = settings.rate;
      const voice = pickVoice(voices, settings);
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }

      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });
      const entry = { utterance, done, resolve: resolveDone, watchdog: null };
      current = entry;

      const started = new Promise((resolve) => {
        const onStart = () => resolve(true);
        utterance.addEventListener('start', onStart, { once: true });
        setTimeout(() => resolve(false), START_TIMEOUT_MS);
      });
      const settle = () => { if (current === entry) clear(); };
      utterance.addEventListener('end', settle, { once: true });
      utterance.addEventListener('error', settle, { once: true });
      // Chrome intermittently drops 'end' on long utterances; without this the tour would wait
      // out the full settle cap on every such scene.
      entry.watchdog = setTimeout(settle, speechMs(script) + WATCHDOG_SLACK_MS);

      synth.speak(utterance);
      const spoke = await started;
      if (!spoke && current === entry) clear();
      return { spoke, reason: spoke ? null : 'blocked' };
    },

    /* Wait for the current utterance to finish, bounded. Resolves immediately when silent, so
       callers can await unconditionally. */
    async settle(capMs = SETTLE_CAP_MS) {
      if (!current) return;
      const cap = Number(capMs) > 0 ? Number(capMs) : SETTLE_CAP_MS;
      await Promise.race([current.done, new Promise((resolve) => setTimeout(resolve, cap))]);
    },

    cancel() {
      if (!available()) return this;
      clear();
      try { synth.cancel(); } catch { /* Safari throws when nothing is queued */ }
      return this;
    },

    destroy() { this.cancel(); voicesReady = null; return this; },
  };
})(window);
