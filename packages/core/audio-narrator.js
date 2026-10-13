/* ScreenReel audio narrator: plays a timed step's pre-recorded narration (`narrationAudio` on an info
   card) through an HTMLAudioElement.

   The browser-speech narrator (narrator.js) speaks text; this one plays a file that was generated
   ahead of time (for example by an AI voice with word timestamps, from which the step's timeline was
   copied). The audio never drives the timeline: the step clock (step-clock.js) does, so muting,
   a blocked autoplay, or a missing file changes what the viewer hears and nothing else.

   One file plays at a time; play() replaces whatever is playing. The Audio constructor is injectable
   through the window argument, so test/audio-narrator.test.mjs drives it with a fake.
   Globals are screenreel-prefixed so this never clashes with a host app's own tooling. */
(function initScreenReelAudioNarrator(root) {
  if (root.__screenreelAudioNarrator) return;

  const MS_PER_SECOND = 1000;
  const BLOCKED_ERRORS = new Set(['NotAllowedError']); // the autoplay policy refused before a user gesture

  let current = null; // { audio, url, done: Promise, resolve, onEnd }

  const available = () => typeof root.Audio === 'function';

  function clear(entry) {
    if (!entry || current !== entry) return;
    current = null;
    entry.audio.removeEventListener?.('ended', entry.onEnd);
    entry.audio.removeEventListener?.('error', entry.onEnd);
    entry.resolve();
  }

  root.__screenreelAudioNarrator = {
    available,
    /* Whether a file is loaded and has not ended (it may be paused). */
    playing() { return Boolean(current); },
    url() { return current?.url ?? null; },

    /* Play `url` from `offsetMs` (0 is the start), replacing anything playing. Resolves { played }
       once the browser starts it, or { played: false, reason } when it cannot: 'unsupported' (no
       Audio), 'empty' (no url), 'blocked' (the autoplay policy), or 'error' (the file failed). The
       caller never needs to await it: the step's timeline does not wait for audio to start. */
    async play(url, { offsetMs = 0 } = {}) {
      if (!available()) return { played: false, reason: 'unsupported' };
      const source = String(url ?? '').trim();
      this.stop();
      if (!source) return { played: false, reason: 'empty' };
      const audio = new root.Audio(source);
      audio.preload = 'auto';
      // Before metadata loads this sets the default start position, which the browser honours on play.
      if (Number(offsetMs) > 0) audio.currentTime = Number(offsetMs) / MS_PER_SECOND;
      let resolveDone;
      const done = new Promise((resolve) => { resolveDone = resolve; });
      const entry = { audio, url: source, done, resolve: resolveDone, onEnd: null };
      entry.onEnd = () => clear(entry);
      audio.addEventListener('ended', entry.onEnd);
      audio.addEventListener('error', entry.onEnd);
      current = entry;
      try {
        await audio.play();
        return { played: current === entry, reason: current === entry ? null : 'replaced' };
      } catch (error) {
        // stop() or a newer play() while this one was starting rejects it with an AbortError: not a failure.
        if (current !== entry) return { played: false, reason: 'stopped' };
        clear(entry);
        return { played: false, reason: BLOCKED_ERRORS.has(error?.name) ? 'blocked' : 'error', error };
      }
    },

    /* Pause and resume the file in place; the step clock pauses alongside it. */
    pause() { current?.audio.pause(); return this; },
    resume() {
      const entry = current; if (!entry || !entry.audio.paused) return this;
      Promise.resolve(entry.audio.play()).catch(() => clear(entry));
      return this;
    },

    /* Resolves when the file ends, is stopped, or is replaced; at once when nothing plays. A paused
       file has not ended, so this keeps waiting through a pause. */
    settle() { return current ? current.done : Promise.resolve(); },

    stop() {
      const entry = current; if (!entry) return this;
      try { entry.audio.pause(); } catch { /* a detached element can throw; it is going anyway */ }
      entry.audio.removeAttribute?.('src');
      clear(entry);
      return this;
    },
    cancel() { return this.stop(); },
    destroy() { return this.stop(); },
  };
})(window);
