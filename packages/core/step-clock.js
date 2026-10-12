/* ScreenReel step clock: the timeline of a timed step.

   A step is an info card (a `callout` action) and the actions after it, up to the next card. A card
   that carries `stepMs` makes its step TIMED: the card showing is the step's t0, every following
   action that carries `atMs` runs at t0 + atMs, and the next card waits until t0 + stepMs. The
   timeline lives in the flow, not in any audio: when a step has `narrationAudio`, its timeline was
   copied from that audio's word timestamps, so the two match, and the step plays with identical
   timing with the audio muted, blocked, or removed. See docs/playback.md ("Timed steps and
   narration audio").

   Pure apart from the timers, which are injectable so the clock is unit-tested on a fake clock
   (test/step-clock.test.mjs). Globals are screenreel-prefixed so this never clashes with a host. */
(function initScreenReelStepClock(root) {
  if (root.ScreenReelStepClock) return;

  /* When a step's audio outlives its timeline (a slower decode, a late start), the next card waits
     for the audio to end, but never more than this past stepMs: the timeline stays authoritative. */
  const AUDIO_OVERRUN_CAP_MS = 1500;
  const CALLOUT_TYPE = 'callout';

  const realTimers = () => ({
    now: () => (root.performance?.now ? root.performance.now() : Date.now()),
    setTimeout: (fn, ms) => root.setTimeout(fn, ms),
    clearTimeout: (id) => root.clearTimeout(id),
  });

  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const isCallout = (action) => action?.type === CALLOUT_TYPE;

  /* A callout's step length, or null when the step is not timed (no stepMs, or not a positive number). */
  function stepMsOf(action) {
    return isCallout(action) && isNumber(action.stepMs) && action.stepMs > 0 ? action.stepMs : null;
  }
  /* An action's offset into its step, or null when it has none. */
  function atMsOf(action) {
    return isNumber(action?.atMs) && action.atMs >= 0 ? action.atMs : null;
  }
  /* Whether an action's timing comes from a step timeline rather than its own holds: a timed card, or
     an action placed on one. Studio's pacer (packages/studio/pacing.js) never stretches these. */
  function isTimedAction(action) {
    return stepMsOf(action) != null || atMsOf(action) != null;
  }

  /* Each action's place on the timeline, by index: { owner, stepMs, atMs }. `owner` is the index of the
     timed card whose step the action is in (the card itself included), or -1 outside a timed step.
     `atMs` is kept only where it applies: on an action inside a timed step, after its card. */
  function planSteps(actions) {
    let owner = -1;
    return (actions || []).map((action, index) => {
      if (isCallout(action)) owner = stepMsOf(action) != null ? index : -1;
      const inStep = owner >= 0 && owner !== index;
      return { owner, stepMs: owner >= 0 ? actions[owner].stepMs : null, atMs: inStep ? atMsOf(action) : null };
    });
  }

  /* Authoring mistakes in a scene's timeline, as [{ actionIndex, message }]. Errors make the timing
     wrong or ignored; nothing here blocks playback, which simply runs late actions at once. */
  function validateTimedSteps(actions) {
    const problems = [];
    const report = (actionIndex, message) => problems.push({ actionIndex, message });
    let owner = null; let lastAt = -1;
    (actions || []).forEach((action, index) => {
      // stepMs on other actions (a glow sequence's or a countdown's beat) is theirs, not a step's.
      if (isCallout(action) && action.stepMs != null && stepMsOf(action) == null) report(index, 'stepMs must be a positive number of milliseconds');
      if (action?.narrationAudio != null && !isCallout(action)) report(index, 'narrationAudio is only read on an info card (callout)');
      else if (action?.narrationAudio != null && (typeof action.narrationAudio !== 'string' || !action.narrationAudio.trim())) report(index, 'narrationAudio must be the URL of an audio file');
      if (isCallout(action)) { owner = stepMsOf(action) != null ? action : null; lastAt = -1; }
      if (action?.atMs == null) return;
      if (atMsOf(action) == null) { report(index, 'atMs must be a number of milliseconds, 0 or more'); return; }
      if (isCallout(action)) { report(index, 'atMs is not read on an info card: the card starts its step'); return; }
      if (!owner) { report(index, 'atMs is ignored: no earlier info card in this scene sets stepMs'); return; }
      if (action.atMs > owner.stepMs) report(index, `atMs ${action.atMs} is past the step's stepMs ${owner.stepMs}`);
      if (action.atMs < lastAt) report(index, `atMs ${action.atMs} is earlier than the action before it (${lastAt}); it will run late`);
      lastAt = Math.max(lastAt, action.atMs);
    });
    return problems;
  }

  /* One step's clock. elapsed() is milliseconds since start(), not counting paused time. A wait
     resolves once elapsed() reaches its offset; one already past resolves at once, so a late action
     runs immediately and the next one is still measured from t0: lateness never accumulates. */
  function createStepClock(timers = realTimers()) {
    let stepMs = null; let startedAt = null; let pausedAt = null; let pausedTotal = 0;
    const waiters = new Set();

    const elapsed = () => {
      if (startedAt == null) return 0;
      const reference = pausedAt ?? timers.now();
      return Math.max(0, reference - startedAt - pausedTotal);
    };
    const settle = (waiter, result) => {
      timers.clearTimeout(waiter.timer); waiters.delete(waiter);
      waiter.signal?.removeEventListener?.('abort', waiter.onAbort);
      waiter.resolve(result);
    };
    /* Timers can fire a little early or late; on every wake re-read the clock rather than trusting it. */
    const schedule = (waiter) => {
      timers.clearTimeout(waiter.timer); waiter.timer = null;
      if (pausedAt != null || startedAt == null) return;
      const remaining = waiter.offsetMs - elapsed();
      if (remaining <= 0) { settle(waiter, { aborted: false, lateMs: Math.max(0, -remaining) }); return; }
      waiter.timer = timers.setTimeout(() => schedule(waiter), remaining);
    };

    return {
      start(ms) {
        stepMs = isNumber(ms) && ms > 0 ? ms : null;
        startedAt = timers.now(); pausedAt = null; pausedTotal = 0;
        waiters.forEach(schedule);
        return this;
      },
      /* Back to t0, keeping stepMs and any pending waits (they now wait from the new t0). */
      restart() { return this.start(stepMs); },
      pause() { if (startedAt != null && pausedAt == null) { pausedAt = timers.now(); waiters.forEach((waiter) => { timers.clearTimeout(waiter.timer); waiter.timer = null; }); } return this; },
      resume() { if (pausedAt != null) { pausedTotal += timers.now() - pausedAt; pausedAt = null; waiters.forEach(schedule); } return this; },
      /* Ends the step: every pending wait resolves as aborted, so nothing awaits a clock that stopped. */
      stop() { [...waiters].forEach((waiter) => settle(waiter, { aborted: true, lateMs: 0 })); startedAt = null; pausedAt = null; pausedTotal = 0; return this; },
      elapsed,
      paused: () => pausedAt != null,
      running: () => startedAt != null,
      stepMs: () => stepMs,
      state: () => ({ stepMs, elapsedMs: Math.round(elapsed()), paused: pausedAt != null, running: startedAt != null }),
      /* Resolves { aborted, lateMs } once elapsed() >= offsetMs, or at once when the signal aborts or
         the clock is stopped. lateMs is how far past the offset the clock already was. */
      waitUntil(offsetMs, signal) {
        if (signal?.aborted) return Promise.resolve({ aborted: true, lateMs: 0 });
        return new Promise((resolve) => {
          const waiter = { offsetMs: Math.max(0, Number(offsetMs) || 0), resolve, signal, timer: null };
          waiter.onAbort = () => settle(waiter, { aborted: true, lateMs: 0 });
          signal?.addEventListener?.('abort', waiter.onAbort, { once: true });
          waiters.add(waiter); schedule(waiter);
        });
      },
    };
  }

  root.ScreenReelStepClock = { AUDIO_OVERRUN_CAP_MS, createStepClock, planSteps, validateTimedSteps, stepMsOf, atMsOf, isTimedAction };
})(globalThis);
