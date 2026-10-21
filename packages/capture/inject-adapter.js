// Capture adapter over the same ScreenReelCore executor used by Projector and Studio.
(function initCaptureAdapter() {
  if (window.__screenreel) return;
  const moveCursor = async (el) => { if (window.__screenreelCursor && el) await window.__screenreelCursor.moveTo(el).catch(() => {}); };
  /* Tells Capture when a timed card shows, so its narration file can start at that moment in the
     clip. Capture installs window.__screenreelStepShown as a Playwright binding, which survives the
     navigation a scene can end with. Called before the card's action, as the Projector starts its
     step clock and audio before it (packages/projector/projector.js startTimedStep). */
  const reportStepShown = (info) => { if (typeof window.__screenreelStepShown === 'function') window.__screenreelStepShown(info); };
  window.__screenreel = {
    /* Plays a scene the way an autoplay tour does, timed steps included (docs/playback.md, "Timed
       steps and narration audio"): a card with stepMs starts a step and stays up for all of it,
       each later action with atMs runs at that time on the step clock, the first action without
       atMs waits for the step to end, and a step ends at stepMs or when its narration ends, but no
       more than AUDIO_OVERRUN_CAP_MS later. `variables` and `timing` are optional and additive:
       older callers pass only the scene. `timing.audioMs` maps a timed card's action index to its
       narration file's length, which Capture reads before the take. */
    async runActions(scene, variables, timing) {
      const stepClock = window.ScreenReelStepClock;
      if (!stepClock) throw new Error('ScreenReel capture: step-clock.js must be injected before inject-adapter.js');
      if (scene.waitFor) await window.ScreenReelCore.waitFor(document, scene.waitFor, 'visible', 15000);
      const actions = scene.actions || [];
      const places = stepClock.planSteps(actions);
      const audioMs = timing?.audioMs || {};
      const baseContext = {
        document, window, moveCursor, variables,
        // Capture clips are per-scene and linear, so a choice can't jump mid-clip: chooseOption
        // renders the cards, visually picks defaultScene (else the first option), and continues.
        chooseOption: (candidate) => candidate.defaultScene || candidate.options?.[0]?.scene,
        navigate: (route) => { location.href = route; },
        warn: (message) => console.warn('[screenreel]', message),
      };
      let step = null; // { index, endMs, clock, releases }
      const finishStep = async () => {
        if (!step) return;
        const current = step; step = null;
        await current.clock.waitUntil(current.endMs);
        current.clock.stop();
        current.releases.splice(0).forEach((release) => release());
      };
      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index];
        const place = places[index];
        if (step && place.owner !== step.index) await finishStep();
        let context = baseContext;
        if (place.owner === index) {
          const fileMs = Number(audioMs[index]) || 0;
          const endMs = Math.min(Math.max(action.stepMs, fileMs), action.stepMs + stepClock.AUDIO_OVERRUN_CAP_MS);
          const current = { index, endMs, clock: stepClock.createStepClock().start(action.stepMs), releases: [] };
          step = current;
          reportStepShown({ sceneId: scene.id, index, at: Date.now() });
          // The card outlives its own action: it is released when the step ends. While the step's
          // actions run the page is not dimmed, as in the Projector.
          context = { ...baseContext, persist: true, skipHold: true, retain: (release) => current.releases.push(release), noDim: place.stepActions > 0 || undefined };
        } else if (step && place.owner === step.index) {
          if (place.atMs != null) await step.clock.waitUntil(place.atMs);
          context = { ...baseContext, noDim: true };
        }
        try {
          await window.ScreenReelCore.runAction(action, context);
        } catch (error) { console.warn('[screenreel] action failed', action, error); }
      }
      await finishStep();
      return true;
    },
  };
})();
