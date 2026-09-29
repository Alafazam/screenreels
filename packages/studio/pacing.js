/* Duration arithmetic for ScreenReel Studio: how long an action holds the screen, and how much
   longer it has to hold for the line spoken over it to finish. Pure and leaf — no DOM at import
   time and no sibling imports — so it is unit-testable under node --test, which studio.js itself is
   not (its `./icons.js` import only resolves in the flattened build output).

   One duration model serves both the scene table's Time column and the pacer, so the estimate an
   author reads is the estimate the pacer fits the line into. */

const CHOICE_ESTIMATE_MS = 5000; // a viewer choice has no fixed duration; assume a beat for planning
/* Speech length is only ever an estimate, so every number here errs long — the mistake an author
   notices is a sentence clipped mid-word, not a scene that ran a fraction of a second over. */
export const SPEECH_PAD_MS = 250;  // don't clip the last syllable on an estimate that is only rough
export const PACE_ROUND_MS = 100;  // round added time up, mirroring the recorder's IDLE_GAP_ROUND_MS
export const PACE_MAX_MS = 30000;  // the ceiling the action editor's own number fields accept
export const PACE_FIELDS = ['holdMs', 'ms'];                           // an action's own on-screen duration
export const PACE_SKIP_TYPES = new Set(['goto', 'choice', 'waitFor']); // length decided at play time
const NARRATION_SETTLE_FALLBACK_MS = 6000; // narrator.settleCapMs, for a host whose narrator is absent
const MS_PER_SECOND = 1000;
/* Last-resort estimates for when the action registry is not loaded (a bare Node import): the
   registry's own defaults resolve first in actionSelfMs, and these mirror them. */
const ESTIMATE_FALLBACKS = { glowStepMs: 1050, glowCount: 6, countdownStepMs: 720, countdownFrom: 3, typeCharMs: 45 };

/* Browser-only lookups, guarded so a Node import stays clean. The narrator is the authority on how
   long a line takes to say; without one, pacing simply does nothing. */
const narratorApi = () => (typeof window === 'undefined' ? null : window.__screenreelNarrator);
export const estimateSpeechMs = (text) => Number(narratorApi()?.estimateMs?.(text)) || 0;
const narrationSettleCapMs = () => Number(narratorApi()?.settleCapMs) || NARRATION_SETTLE_FALLBACK_MS;
const definitionOf = (action) => (typeof window === 'undefined' ? null : window.ScreenReelCore?.definitionForAction(action) ?? null);

/* How long an action occupies the screen on its own, excluding afterMs (callers add it).

   Registry defaults resolve BEFORE the literals, so an imported `{"type":"highlight"}` carrying no
   holdMs of its own estimates its registry 1600 rather than 0. */
export function actionSelfMs(action, definition) {
  const num = (key, fallback) => Number(action[key] ?? definition?.defaults?.[key] ?? fallback) || 0;
  if (action.type === 'glow' && action.sequence) return num('stepMs', ESTIMATE_FALLBACKS.glowStepMs) * num('count', ESTIMATE_FALLBACKS.glowCount);
  // runCountdown plays `from…1` and then "Go", so a 3-count is four beats rather than one stepMs.
  if (action.type === 'countdown') return num('stepMs', ESTIMATE_FALLBACKS.countdownStepMs) * (Math.max(1, num('from', ESTIMATE_FALLBACKS.countdownFrom)) + 1);
  let ms = num('holdMs', 0) || num('durMs', 0) || num('ms', 0) || num('stepMs', 0);
  if (action.type === 'type') ms += num('charMs', ESTIMATE_FALLBACKS.typeCharMs) * String(action.text ?? definition?.defaults?.text ?? '').length;
  if (action.type === 'choice') ms += num('timeoutMs', 0) || CHOICE_ESTIMATE_MS;
  return ms;
}

/* The patch that makes an action last long enough for its own spoken line. Returns the timing field
   it chose, the value to write, and how much it added — nothing is applied here, so a caller can
   preview the result before committing it (the Voiceover modal's hint does exactly that).

   Idempotent by construction: `action.pace` records what a previous pass added, and that is
   subtracted back off before anything is measured. Without it, every save would ratchet the hold
   longer. It also only ever raises the author's own number, never lowers it. */
export function planPace(action, definition, speechMs) {
  const field = PACE_FIELDS.find((key) => (definition?.fields || []).some((spec) => spec.key === key)) || 'afterMs';
  const base = { ...action };
  if (action.pace?.field) base[action.pace.field] = Math.max(0, Number(action[action.pace.field] || 0) - (Number(action.pace.addedMs) || 0));
  const baseValue = Number(base[field] || 0);
  const windowMs = actionSelfMs(base, definition) + Number(base.afterMs || 0);
  const speech = Number(speechMs) || 0;
  const deficit = speech > 0 && !PACE_SKIP_TYPES.has(action.type) ? speech + SPEECH_PAD_MS - windowMs : 0;
  if (deficit <= 0) return { [field]: baseValue, pace: null, addedMs: 0, field, capped: false };
  const wanted = baseValue + Math.ceil(deficit / PACE_ROUND_MS) * PACE_ROUND_MS;
  const value = Math.max(baseValue, Math.min(PACE_MAX_MS, wanted));
  const applied = value - baseValue;
  return { [field]: value, pace: applied ? { field, addedMs: applied } : null, addedMs: applied, field, capped: value < wanted };
}

/* A scene's wall-clock length, as the table's Time column reports it. Speech and action time
   OVERLAP: a line starts when its action does and keeps talking while later actions run, so only
   the part that outlives the remaining actions adds to the scene — and an action's own line
   replaces whatever is still speaking, because speak() cancels in flight.

   Deliberate non-goal: this ignores ScreenReelCore.timeScale(). Speech is never time-scaled (only
   sleep() goes through scaled()), so a host running timeScale > 1 just gets extra slack, which is
   the safe direction to be wrong in. The estimator is injectable so tests can be deterministic. */
export function estimateSceneSeconds(scene, defaults, speechMs = estimateSpeechMs) {
  let ms = Number(scene.dwellMs ?? defaults?.dwellMs ?? 0) + Number(scene.settleMs ?? defaults?.settleMs ?? 0);
  let pending = Number(speechMs(scene.narration ?? scene.talkingPoints ?? '')) || 0;
  for (const action of scene.actions || []) {
    const windowMs = actionSelfMs(action, definitionOf(action)) + Number(action.afterMs || 0);
    const line = String(action.narration ?? '').trim();
    if (line) pending = Number(speechMs(line)) || 0;
    pending = Math.max(0, pending - windowMs);
    ms += windowMs;
  }
  ms += Math.min(Number(scene.narrationCapMs) || narrationSettleCapMs(), pending);
  return Math.max(1, Math.round(ms / MS_PER_SECOND));
}
