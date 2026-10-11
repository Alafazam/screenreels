/* ScreenReel playback model: named modes, the presets behind them, and how a run picks one.
   Pure: no DOM, no storage. The Projector, Studio, the CLI (`flow validate` / `flow doctor`) and the
   unit tests all read this one file, so a mode means the same thing everywhere. See docs/playback.md. */
(function initScreenReelPlayback(root) {
  if (root.ScreenReelPlayback) return;

  /* The modes a flow can play in, and 'ask', which shows a chooser among the ones it offers. */
  const MODES = ['video', 'autoplay', 'guided'];
  const ASK = 'ask';
  /* Older names. `advance: 'auto'` was Autoplay before the modes had names. */
  const MODE_ALIASES = { auto: 'autoplay' };
  /* What the chooser offers when nothing says otherwise: the two modes there were before video. */
  const DEFAULT_MODES = ['guided', 'autoplay'];
  /* What a run plays when nothing picks a mode, as before the model existed. */
  const FALLBACK_MODE = 'autoplay';
  /* How a callout (info card) plays: wait for Next, hold for its reading time, show its words as a
     caption with no card, or skip it. */
  const CALLOUT_STYLES = ['step', 'timed', 'caption', 'off'];
  /* Pill controls in display order (the Projector renders them). */
  const PILL_CONTROLS = ['flow', 'count', 'prev', 'play', 'next', 'sound', 'notes', 'studio', 'exit'];
  /* `remember` on the mount option: keep each viewer's last chooser pick per flow, and either focus
     it in the chooser ('preselect', also `true`) or play it without asking again ('skip'). */
  const REMEMBER = ['preselect', 'skip'];

  /* Every setting a mode controls. `type` drives validation; `help` is the docs/Studio wording. */
  const FIELDS = {
    callouts: { type: 'enum', values: CALLOUT_STYLES, help: 'How info cards play: step (wait for Next), timed (hold for reading time), caption (words only), off.' },
    controls: { type: 'controls', help: 'Pill buttons, in display order. [] hides the pill; null keeps the presenter/share default.' },
    controlLabels: { type: 'boolean', help: 'Show "Previous scene" / "Next scene" text on the pill, not just arrows.' },
    progress: { type: 'boolean', help: 'A thin bar with "Scene N of M" while the flow plays.' },
    startCard: { type: 'boolean', help: 'A brief title card before the first scene.' },
    endCard: { type: 'boolean', help: 'An end card with Replay and Close when the flow finishes.' },
    notes: { type: 'boolean', help: 'Toast each action\'s `note`.' },
    narration: { type: 'boolean', help: 'Speak narration (the viewer can still mute; mount `narration: false` turns it off everywhere).' },
    cursor: { type: 'boolean', help: 'Show the agent cursor.' },
    dim: { type: 'boolean', help: 'Dim the page behind highlights and cards.' },
    shield: { type: 'boolean', help: 'Block stray viewer clicks on the app while it plays.' },
    keys: { type: 'boolean', help: '→/Enter next, ← back, Esc exit.' },
    pace: { type: 'pace', help: 'Time scale for this mode (1 = authored timing, 1.5 = slower). null keeps the host\'s.' },
  };

  /* Each mode is a preset of the settings above. A host (mount `playback`) or a flow
     (`defaults.playback`) overrides any of them per mode. */
  const PRESETS = Object.freeze({
    video: Object.freeze({ callouts: 'off', controls: ['play', 'sound', 'exit'], controlLabels: false, progress: true, startCard: true, endCard: true, notes: false, narration: true, cursor: true, dim: true, shield: true, keys: false, pace: null }),
    autoplay: Object.freeze({ callouts: 'timed', controls: ['count', 'prev', 'play', 'next', 'sound', 'exit'], controlLabels: true, progress: true, startCard: true, endCard: true, notes: true, narration: true, cursor: true, dim: true, shield: true, keys: false, pace: null }),
    guided: Object.freeze({ callouts: 'step', controls: [], controlLabels: false, progress: false, startCard: false, endCard: false, notes: false, narration: true, cursor: true, dim: true, shield: true, keys: true, pace: null }),
  });
  /* A run configured only by the pre-model options (no `playback` on the mount or the flow) keeps
     exactly how it looked before: the presenter/share pill, no cards, no progress bar. */
  const LEGACY_LOOK = Object.freeze({ controls: null, controlLabels: false, progress: false, startCard: false, endCard: false });

  const FLOW_KEYS = ['modes', 'default', ...MODES];
  const MOUNT_KEYS = [...FLOW_KEYS, 'force', 'remember'];

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  /* 'auto' → 'autoplay'; unknown → null. `allowAsk` admits 'ask'. */
  function modeName(value, { allowAsk = false } = {}) {
    if (value == null) return null;
    const name = MODE_ALIASES[value] ?? value;
    if (MODES.includes(name)) return name;
    if (allowAsk && name === ASK) return ASK;
    return null;
  }

  /* One mode's override object: problems as messages, prefixed by `where`. */
  function overrideErrors(override, where) {
    if (!isObject(override)) return [`${where} must be an object of settings`];
    const errors = [];
    for (const [key, value] of Object.entries(override)) {
      const field = FIELDS[key];
      if (!field) { errors.push(`${where}.${key} is not a playback setting (expected ${Object.keys(FIELDS).join(', ')})`); continue; }
      if (field.type === 'enum' && !field.values.includes(value)) errors.push(`${where}.${key} must be ${field.values.join(', ')}`);
      if (field.type === 'boolean' && typeof value !== 'boolean') errors.push(`${where}.${key} must be true or false`);
      if (field.type === 'pace' && value !== null && !(typeof value === 'number' && value > 0)) errors.push(`${where}.${key} must be a number above 0, or null`);
      if (field.type === 'controls' && value !== null) {
        if (!Array.isArray(value)) errors.push(`${where}.${key} must be an array of pill controls, or null`);
        else { const unknown = value.filter((name) => !PILL_CONTROLS.includes(name)); if (unknown.length) errors.push(`${where}.${key} has unknown controls: ${unknown.join(', ')}`); }
      }
    }
    return errors;
  }

  /* A `playback` object, from a flow (`defaults.playback`) or a mount option. */
  function configErrors(config, where, allowedKeys) {
    if (!isObject(config)) return [`${where} must be an object`];
    const errors = [];
    for (const key of Object.keys(config)) if (!allowedKeys.includes(key)) errors.push(MOUNT_KEYS.includes(key) ? `${where}.${key} is a mount option; a flow cannot set it` : `${where}.${key} is not a playback option (expected ${allowedKeys.join(', ')})`);
    if (config.modes !== undefined) {
      if (!Array.isArray(config.modes) || !config.modes.length) errors.push(`${where}.modes must be a non-empty array of ${MODES.join(', ')}`);
      else {
        const bad = config.modes.filter((mode) => !MODES.includes(mode));
        if (bad.length) errors.push(`${where}.modes has unknown modes: ${bad.join(', ')} (expected ${MODES.join(', ')}${bad.includes(ASK) ? '; "ask" goes in default, not modes' : ''})`);
        if (new Set(config.modes).size !== config.modes.length) errors.push(`${where}.modes lists a mode twice`);
      }
    }
    for (const key of ['default', 'force']) {
      if (config[key] === undefined) continue;
      const name = modeName(config[key], { allowAsk: true });
      if (!name || name !== config[key]) errors.push(`${where}.${key} must be ${[...MODES, ASK].join(', ')}, got "${config[key]}"`);
      else if (name !== ASK && Array.isArray(config.modes) && !config.modes.includes(name)) errors.push(`${where}.${key} "${name}" is not in ${where}.modes`);
    }
    if (config.remember !== undefined && config.remember !== true && config.remember !== false && !REMEMBER.includes(config.remember)) errors.push(`${where}.remember must be true, false, ${REMEMBER.join(', ')}`);
    for (const mode of MODES) if (config[mode] !== undefined) errors.push(...overrideErrors(config[mode], `${where}.${mode}`));
    return errors;
  }

  /* A flow's own playback, normalized, from `defaults.playback` or the older `defaults.advance`.
     `declared` is false for a flow that says nothing (it then plays the host's default). */
  function flowConfig(flow) {
    const defaults = flow?.defaults || {};
    const config = isObject(defaults.playback) ? defaults.playback : null;
    const overrides = {};
    if (config) for (const mode of MODES) if (isObject(config[mode])) overrides[mode] = config[mode];
    const modes = config && Array.isArray(config.modes) ? config.modes.filter((mode) => MODES.includes(mode)) : null;
    const fromPlayback = config ? modeName(config.default, { allowAsk: true }) : null;
    const fromAdvance = modeName(defaults.advance, { allowAsk: true });
    return { modeled: !!config, modes: modes?.length ? modes : null, default: fromPlayback ?? fromAdvance, overrides, declared: !!(fromPlayback || fromAdvance || modes) };
  }

  /* The host's playback, normalized from the mount `playback` option plus the older options it
     replaces. `deprecated` names the older options in use, for a one-time hint. */
  function mountConfig(options = {}) {
    const config = isObject(options.playback) ? options.playback : {};
    const overrides = {}; const deprecated = [];
    for (const mode of MODES) overrides[mode] = { ...(isObject(config[mode]) ? config[mode] : {}) };
    // `controls`: one list for every mode, or { guided, auto } per mode. Below `playback.<mode>.controls`.
    if (Array.isArray(options.controls)) { deprecated.push('controls'); for (const mode of MODES) overrides[mode].controls ??= options.controls; }
    else if (isObject(options.controls)) {
      deprecated.push('controls');
      for (const [key, value] of Object.entries(options.controls)) { const mode = modeName(key); if (mode && Array.isArray(value)) overrides[mode].controls ??= value; }
    }
    let force = modeName(config.force, { allowAsk: true });
    if (options.advance !== undefined) { deprecated.push('advance'); force ??= modeName(options.advance, { allowAsk: true }); }
    // `chooser: true` asked whatever the flow said; `chooser: false` never asks.
    if (options.chooser !== undefined) deprecated.push('chooser');
    if (options.chooser === true && !config.force) force = ASK;
    const modes = Array.isArray(config.modes) ? config.modes.filter((mode) => MODES.includes(mode)) : null;
    return {
      modeled: isObject(options.playback), modes: modes?.length ? modes : null, default: modeName(config.default, { allowAsk: true }), force,
      canAsk: options.chooser !== false, remember: config.remember === true ? 'preselect' : REMEMBER.includes(config.remember) ? config.remember : null,
      overrides,
      // Host switches that win over every preset and flow: a host that turned a thing off means it.
      limits: { ...(options.narration === false ? { narration: false } : {}), ...(options.cursor === false ? { cursor: false } : {}), ...(options.shield === false ? { shield: false } : {}), ...(options.dim === false || options.dim === 0 ? { dim: false } : {}) },
      deprecated,
    };
  }

  /* The modes the chooser offers for this flow on this host, in the flow's order: the flow's `modes`
     (or the host's, or guided + autoplay), narrowed to the host's `modes` when it sets them. */
  function offeredModes(flow, mount) {
    const base = flow.modes ?? mount.modes ?? DEFAULT_MODES;
    if (!mount.modes) return [...base];
    const allowed = base.filter((mode) => mount.modes.includes(mode));
    return allowed.length ? allowed : [...mount.modes];
  }

  /* Which mode a run starts in, highest first:
       1. `start(flowId, { mode })`;
       2. the host's `playback.force` (older: `chooser: true` → 'ask', `advance`);
       3. the flow's `defaults.playback.default` (older: `defaults.advance`);
       4. the host's `playback.default`;
       5. 'autoplay'.
     'ask' then shows the chooser, unless the flow offers one mode (it plays that), the run cannot ask
     (a share link, `chooser: false`: it plays autoplay if offered, else the first offered mode), or
     the viewer's remembered pick says to skip it. A concrete mode the host's `modes` excludes falls
     back the same way. Returns { mode, ask, offered, preselect, source }. */
  function resolveMode({ flow, mount, requested = null, canAsk = true, remembered = null }) {
    const offered = offeredModes(flow, mount);
    const candidates = [['start', modeName(requested, { allowAsk: true })], ['host', mount.force], ['flow', flow.default], ['host-default', mount.default]];
    const [source, wanted] = candidates.find(([, value]) => value) ?? ['fallback', FALLBACK_MODE];
    const fallback = offered.includes(FALLBACK_MODE) ? FALLBACK_MODE : offered[0];
    const pick = remembered && offered.includes(remembered) ? remembered : null;
    if (wanted !== ASK) {
      if (mount.modes && !mount.modes.includes(wanted)) return { mode: fallback, ask: false, offered, preselect: null, source: 'restricted' };
      return { mode: wanted, ask: false, offered, preselect: null, source };
    }
    if (offered.length === 1) return { mode: offered[0], ask: false, offered, preselect: null, source };
    if (!canAsk || !mount.canAsk) return { mode: fallback, ask: false, offered, preselect: null, source };
    if (pick && mount.remember === 'skip' && source !== 'start') return { mode: pick, ask: false, offered, preselect: null, source: 'remembered' };
    return { mode: null, ask: true, offered, preselect: pick, source };
  }

  /* Every setting for one mode, lowest to highest: the preset; the pre-model look when neither the
     host nor the flow uses `playback`; the host's `playback.<mode>` (and older `controls`); the
     flow's `defaults.playback.<mode>`; then the host's hard limits (`narration: false`,
     `cursor: false`, `shield: false`, `dim: false`). */
  function resolveSettings(mode, flow, mount) {
    const name = modeName(mode) ?? FALLBACK_MODE;
    const legacy = !flow.modeled && !mount.modeled;
    return { mode: name, ...PRESETS[name], ...(legacy ? LEGACY_LOOK : {}), ...pick(mount.overrides[name]), ...pick(flow.overrides[name]), ...mount.limits };
  }
  /* Only known settings, so a typo in an override cannot leak into the resolved object. */
  function pick(override) { return Object.fromEntries(Object.entries(override || {}).filter(([key]) => key in FIELDS)); }

  /* Static checks for one flow, for `flow validate`, `flow doctor`, and Studio. Errors stop a flow
     from playing as written; warnings are worth a look. */
  function validateFlowPlayback(flow) {
    const errors = []; const warnings = [];
    const defaults = flow?.defaults || {};
    if (defaults.playback !== undefined) errors.push(...configErrors(defaults.playback, 'defaults.playback', FLOW_KEYS));
    if (defaults.advance !== undefined && !modeName(defaults.advance, { allowAsk: true })) errors.push(`defaults.advance must be ${[...MODES, ASK, 'auto'].join(', ')}, got "${defaults.advance}"`);
    const config = flowConfig(flow);
    if (isObject(defaults.playback) && defaults.playback.default !== undefined && defaults.advance !== undefined) {
      const advance = modeName(defaults.advance, { allowAsk: true }); const chosen = modeName(defaults.playback.default, { allowAsk: true });
      // Studio writes both so older runtimes still play the flow; video has no older name, so autoplay stands in.
      const agrees = advance === chosen || (chosen === 'video' && advance === 'autoplay');
      if (!agrees) warnings.push(`defaults.advance "${defaults.advance}" disagrees with defaults.playback.default "${defaults.playback.default}"; playback wins`);
    }
    const enabled = (flow?.scenes || []).filter((scene) => scene.enabled !== false);
    for (const scene of flow?.scenes || []) if (scene.advance !== undefined && !modeName(scene.advance)) errors.push(`scene ${scene.id}: advance must be ${[...MODES, 'auto'].join(', ')}, got "${scene.advance}"`);
    // Guided waits on info cards; a scene with none just plays through, which surprises a viewer
    // pressing Next. Only checked when the flow can actually play guided.
    const offered = config.default === ASK || config.modes ? (config.modes ?? DEFAULT_MODES) : [config.default ?? FALLBACK_MODE];
    const guidedOffered = offered.includes('guided') || enabled.some((scene) => modeName(scene.advance) === 'guided');
    const guidedCallouts = config.overrides.guided?.callouts ?? PRESETS.guided.callouts;
    if (guidedOffered && guidedCallouts === 'step') {
      for (const scene of enabled) {
        if (scene.advance && modeName(scene.advance) !== 'guided') continue;
        if (!(scene.actions || []).some((action) => action?.type === 'callout')) warnings.push(`scene ${scene.id}: no info cards, so guided viewers watch it play through with nothing to press Next on`);
      }
    }
    if (!enabled.length) warnings.push('the flow has no enabled scenes');
    return { errors, warnings };
  }
  /* The same checks for a host's mount `playback` option. */
  function validateMountPlayback(playback) { return playback === undefined ? [] : configErrors(playback, 'playback', MOUNT_KEYS); }

  root.ScreenReelPlayback = { MODES, ASK, MODE_ALIASES, DEFAULT_MODES, FALLBACK_MODE, CALLOUT_STYLES, PILL_CONTROLS, REMEMBER, FIELDS, PRESETS, LEGACY_LOOK, modeName, flowConfig, mountConfig, offeredModes, resolveMode, resolveSettings, validateFlowPlayback, validateMountPlayback };
})(globalThis);
