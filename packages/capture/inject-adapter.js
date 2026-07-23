// Capture adapter over the same ScreenReelCore executor used by Projector and Studio.
(function initCaptureAdapter() {
  if (window.__screenreel) return;
  const moveCursor = async (el) => { if (window.__screenreelCursor && el) await window.__screenreelCursor.moveTo(el).catch(() => {}); };
  window.__screenreel = {
    async runActions(scene) {
      if (scene.waitFor) await window.ScreenReelCore.waitFor(document, scene.waitFor, 'visible', 15000);
      for (const action of scene.actions || []) {
        try {
          await window.ScreenReelCore.runAction(action, { document, window, moveCursor, navigate: (route) => { location.href = route; }, warn: (message) => console.warn('[screenreel]', message) });
        } catch (error) { console.warn('[screenreel] action failed', action, error); }
      }
      return true;
    },
  };
})();
