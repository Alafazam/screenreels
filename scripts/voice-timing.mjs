/* Pure helpers for scripts/voice-landing.mjs: turn a TTS take's character timings into words, place
   a timed step's actions on those words, and write the flow back in the file's own compact layout.
   No I/O and no network, so test/voice-timing.test.mjs covers all of it. The timing rules follow
   docs/narrated-scenes.md: an action named by a word fires a little before the word, so the screen
   has changed when the word is heard. */

/* Lower case, no punctuation, so "product." matches "product" and "Let's" matches "let's". */
export function normalizeWord(word) {
  return String(word).toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');
}

/* ElevenLabs `alignment` ({ characters, character_start_times_seconds, character_end_times_seconds })
   to [{ w, s, e }] in seconds. A word is a run of non-space characters. */
export function wordsFromAlignment(alignment) {
  const chars = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(chars) || !Array.isArray(starts) || !Array.isArray(ends) || chars.length !== starts.length || chars.length !== ends.length) {
    throw new Error('alignment must have characters, character_start_times_seconds and character_end_times_seconds of the same length');
  }
  const words = [];
  let current = null;
  for (let index = 0; index < chars.length; index += 1) {
    if (/\s/.test(chars[index])) { current = null; continue; }
    if (!current) { current = { w: '', s: starts[index], e: ends[index] }; words.push(current); }
    current.w += chars[index];
    current.e = ends[index];
  }
  return words.filter((word) => normalizeWord(word.w));
}

/* Shift every word by the silence trimmed from the start of the take. */
export function shiftWords(words, seconds) {
  return words.map((word) => ({ w: word.w, s: Math.max(0, word.s - seconds), e: Math.max(0, word.e - seconds) }));
}

/* Index of the word an anchor names. A bare word is the first match at or after `from` (so anchors
   read in order); `nth` is the nth match from the start of the line (1-based). */
export function findWord(words, anchor, from = 0) {
  const wanted = normalizeWord(anchor.word);
  if (anchor.nth != null) {
    let seen = 0;
    for (let index = 0; index < words.length; index += 1) {
      if (normalizeWord(words[index].w) === wanted && ++seen === anchor.nth) return index;
    }
    return -1;
  }
  for (let index = from; index < words.length; index += 1) if (normalizeWord(words[index].w) === wanted) return index;
  return -1;
}

/* How long an action keeps running once it starts, as far as its own fields say. Used only to warn
   when the next anchor comes before this action can finish. */
export function actionDurationMs(action) {
  if (action.type === 'type') return String(action.text ?? '').length * (action.charMs ?? 0);
  return action.durMs ?? action.holdMs ?? 0;
}

/* One timed step: the card's `stepMs` and each anchored action's `atMs`.
   - `durationMs`: the trimmed take's length.
   - `anchors`: [{ action, word, nth?, offset? }] (offset in seconds) or [{ action, atMs }].
   - `timing`: { leadMs, tailMs, actionLeadMs }.
   Throws on a word the line does not contain or a time past the step's end; returns warnings for
   an action that would still be running when the next one is due. */
export function planStep({ words, durationMs, anchors = [], actions = {}, timing }) {
  const { leadMs, tailMs, actionLeadMs } = timing;
  const stepMs = Math.round(leadMs + durationMs + tailMs);
  const placed = [];
  const warnings = [];
  let from = 0;
  let previous = 0;
  for (const anchor of anchors) {
    let atMs;
    if (anchor.atMs != null) atMs = anchor.atMs;
    else {
      const index = findWord(words, anchor, from);
      if (index < 0) throw new Error(`anchor word "${anchor.word}" for action "${anchor.action}" is not in the line`);
      if (anchor.nth == null) from = index + 1;
      atMs = leadMs + words[index].s * 1000 - actionLeadMs + (anchor.offset ?? 0) * 1000;
    }
    atMs = Math.max(previous, Math.max(0, Math.round(atMs)));
    if (atMs > stepMs) throw new Error(`action "${anchor.action}" at ${atMs} ms is past the step's ${stepMs} ms`);
    placed.push({ action: anchor.action, atMs });
    previous = atMs;
  }
  for (let index = 0; index + 1 < placed.length; index += 1) {
    const action = actions[placed[index].action];
    const busyMs = action ? actionDurationMs(action) : 0;
    const gapMs = placed[index + 1].atMs - placed[index].atMs;
    if (busyMs > gapMs) warnings.push(`"${placed[index].action}" runs ${busyMs} ms but "${placed[index + 1].action}" is due ${gapMs} ms later, so it will start late`);
  }
  return { stepMs, atMs: placed, warnings };
}

/* The flow file's layout: one line per scene head and one per action, objects inline with spaces
   inside the braces. formatFlowFile(JSON.parse(text)) gives back the same text for the committed
   file (pinned by a test), so a regenerated timing changes only the lines it touches. */
function inline(value) {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map(inline);
    return value.some((item) => item && typeof item === 'object') ? `[ ${items.join(', ')} ]` : `[${items.join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}
const fields = (object, skip) => Object.entries(object).filter(([key]) => key !== skip).map(([key, value]) => `${JSON.stringify(key)}: ${inline(value)}`).join(', ');

export function formatFlowFile(file) {
  const flows = file.flows.map((flow) => {
    const scenes = flow.scenes.map((scene) => {
      const actions = scene.actions.map((action) => `          ${inline(action)}`).join(',\n');
      return `        { ${fields(scene, 'actions')}, "actions": [\n${actions}\n        ]}`;
    }).join(',\n');
    return `    {\n      ${fields(flow, 'scenes')},\n      "scenes": [\n${scenes}\n      ]\n    }`;
  }).join(',\n');
  const head = Object.entries(file).filter(([key]) => key !== 'flows').map(([key, value]) => `  ${JSON.stringify(key)}: ${inline(value)},\n`).join('');
  return `{\n${head}  "flows": [\n${flows}\n  ]\n}\n`;
}
