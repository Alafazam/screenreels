/* Pure logic for `screenreel flow doctor` — no DOM, no browser, fully unit-testable.
   Classifies validate() error strings, scores fingerprint candidates against live-DOM
   inspection records, downgrades dynamic-target false positives, and rewrites flow files
   surgically so --fix never churns untouched lines. */

/* Fingerprint match scoring. Exact text is the strongest signal a human-facing element is
   "the same thing renamed"; tag and role corroborate; token overlap catches renames. */
export const SCORE_TEXT_EXACT = 60;
export const SCORE_TAG_MATCH = 15;
export const SCORE_ROLE_MATCH = 10;
export const SCORE_TOKEN_OVERLAP_MAX = 15;
export const REPAIR_CONFIDENCE_THRESHOLD = 70; // below this, report candidates but never --fix
export const CANDIDATE_LIMIT = 3;

/* Actions that mutate page state: a later "has no matches" may simply be an element these
   created, so it is a warning (excluded from repair and from failing the run), not an error. */
export const STATE_MUTATING_TYPES = ['click', 'pointer', 'toggle', 'set', 'type', 'drag', 'call', 'goto'];

const ERROR_MULTIPLE = /^(selector|toSelector|cursorTo) matches multiple elements$/;
const ERROR_NO_MATCH = /^(selector|toSelector|cursorTo) has no matches$/;

/* error string -> repair category */
export function classifyError(message) {
  if (ERROR_MULTIPLE.test(message)) return { kind: 'multiple', key: message.split(' ')[0] };
  if (ERROR_NO_MATCH.test(message)) return { kind: 'missing', key: message.split(' ')[0] };
  return { kind: 'report-only', key: null };
}

/* True when a "has no matches" on actions[index] may be the dynamic-target false positive:
   validate() is a current-DOM dry run, so targets created by earlier actions don't exist yet. */
export function isLikelyDynamicTarget(actions, index) {
  const failing = actions[index];
  for (let earlier = 0; earlier < index; earlier++) {
    const action = actions[earlier];
    if (STATE_MUTATING_TYPES.includes(action.type)) return true;
    if (action.type === 'waitFor' && action.selector && action.selector === failing?.selector) return true;
  }
  return false;
}

const tokenize = (value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);

/* Scores one inspectDocument record ({selector, tag, role, text, interactive}) against an
   action's stored fingerprint ({text, tag, role}). */
/* innerText carries newlines between child blocks and CSS text-transform makes case unstable,
   so "same text" means whitespace-collapsed, case-insensitive equality. */
const collapse = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export function scoreCandidate(fingerprint, candidate) {
  let score = 0;
  const wantText = collapse(fingerprint.text);
  const haveText = collapse(candidate.text);
  if (wantText && wantText === haveText) score += SCORE_TEXT_EXACT;
  else if (wantText && haveText) {
    const want = new Set(tokenize(wantText));
    const overlap = tokenize(haveText).filter((token) => want.has(token)).length;
    if (want.size) score += Math.round(Math.min(1, overlap / want.size) * SCORE_TOKEN_OVERLAP_MAX);
  }
  if (fingerprint.tag && fingerprint.tag === candidate.tag) score += SCORE_TAG_MATCH;
  if (fingerprint.role && fingerprint.role === candidate.role) score += SCORE_ROLE_MATCH;
  return score;
}

/* Best replacement for a dead selector. With a fingerprint: score all inspection records and
   propose the winner when it clears the confidence threshold. Without one: tokenize the dead
   selector and offer the closest candidates for a human to choose — never auto-fixed. */
export function proposeRepair({ fingerprint, deadSelector, targets }) {
  if (fingerprint) {
    const ranked = targets
      .map((candidate) => ({ candidate, score: scoreCandidate(fingerprint, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best && best.score >= REPAIR_CONFIDENCE_THRESHOLD) {
      return { kind: 'selector', to: best.candidate.selector, confidence: best.score, candidates: [] };
    }
    return { kind: 'none', confidence: best?.score || 0, candidates: ranked.slice(0, CANDIDATE_LIMIT).filter((item) => item.score > 0).map(({ candidate, score }) => ({ selector: candidate.selector, text: candidate.text, score })) };
  }
  const wanted = new Set(tokenize(deadSelector));
  const ranked = targets
    .map((candidate) => {
      const tokens = tokenize(`${candidate.selector} ${candidate.text}`);
      const overlap = tokens.filter((token) => wanted.has(token)).length;
      return { candidate, score: overlap };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_LIMIT);
  return { kind: 'none', confidence: 0, candidates: ranked.map(({ candidate, score }) => ({ selector: candidate.selector, text: candidate.text, score })) };
}

/* Locates the raw (un-normalized) scenes array inside a parsed flow file using the same shape
   detection normalizeManifest applies, so array positions map 1:1 to the validated manifest. */
export function rawScenesOf(raw, flowIndex) {
  if (Array.isArray(raw?.flows)) return raw.flows[flowIndex]?.scenes || null;
  if (flowIndex !== 0) return null; // steps/scenes shapes wrap exactly one flow
  return raw?.scenes || raw?.steps || null;
}

/* Applies selector/index/fingerprint patches to the parsed raw document in place. Mutating the
   existing objects (rather than round-tripping through normalization) preserves key order and
   every untouched byte of the author's file. Returns the number of patches applied. */
export function applyRepairs(raw, repairs) {
  let applied = 0;
  for (const repair of repairs) {
    const scenes = rawScenesOf(raw, repair.flowIndex);
    const action = scenes?.[repair.sceneIndex]?.actions?.[repair.actionIndex];
    if (!action) continue;
    if (repair.set) { Object.assign(action, repair.set); applied += 1; }
  }
  return applied;
}
