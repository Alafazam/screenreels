# Pacing and the cursor

Two cross-cutting controls that shape how a demo *feels* rather than what it does.

## Pacing: make a demo calmer or brisker

```js
await ScreenReel.mount(button, {
  projectId: 'acme-sales',
  flow: { src: '/demos/sales.json' },
  timeScale: 1.4,        // 40% slower everywhere
});
```

`timeScale` multiplies **every** deliberate delay in the runtime: manifest values, action defaults,
and the runtime's own internals (countdown steps, flash pulses, reveal fades). One number, uniform
effect.

That last group is why this lives in the runtime instead of a script that rewrites your manifest.
Rewriting timings can only reach values that are *written down*; the countdown's per-digit step and
the flash pulse aren't, so a manifest-rewriting scaler stretches some beats and not others — and the
demo gets *less* even as you slow it down.

**Not scaled:** `timeoutMs` and scroll-settle limits. Those are limits, not pacing — scaling them
would change what "broken" means.

Presenter notes ride the same scale, so a note never outlives the emphasis it's narrating.

### When a demo feels rushed

Reach for these in order:

1. **`timeScale`** — the whole demo, one knob. Start around `1.2`–`1.5`.
2. **Per-action `holdMs`** — the specific beat nobody can read in time.
3. **`afterMs`** — a pause *after* an action, for the audience to catch up.
4. **Scene `dwellMs`** — how long a finished scene rests before the next one.

A useful rule from tuning the example tour: an emphasis beat should last at least as long as it takes
to read its note. Under about a second, viewers see motion but absorb nothing.

### Measuring it

Per-scene estimates show in Studio's scene table. For a real number, time it in a normal browser
window — headless and backgrounded tabs throttle `requestAnimationFrame` and timers hard, so any
measurement taken there is fiction.

## Guided or automatic advance

```js
advance: 'auto'    // default — each finished scene rests for dwellMs, then the next one plays
advance: 'guided'  // each finished scene waits until the viewer presses Next
```

A flow can set its own mode with `"defaults": { "advance": "guided" }`; the mount option wins, so
the same flow can run guided inside the product and automatic on a share link. In guided mode the
Next button pulses while the tour is waiting, share links get a Next button too, and Next on the
last scene of a `loop: false` flow completes the tour (`screenreel:complete`). Each wait also
dispatches `screenreel:awaitingnext` with `{ projectId, flowId, sceneId }`. The step is a scene:
the actions inside a scene still run back to back.

## Dimming behind highlights

`highlight`, `highlight sequence`, and `callout` dim the rest of the page to `0.45` so the eye
lands on the target; `spotlight` keeps its stronger `0.62`. Set `dim` on an action to tune one
beat, or on the mount options to change the default everywhere:

```js
dim: 0.3     // lighter background dimming for every highlight and callout
dim: false   // no dimming (an action's own dim still applies)
```

`0` or `false` on an action turns it off for that beat. The presenter pill is never dimmed.

## The agent cursor

A pointer travels to each target before the action fires, emits rings on arrival to mark its
position, dips with a brighter ring on click, and drifts while the page scrolls so motion reads as
cursor-driven.

```js
cursor: 'dot'     // default — a soft dark disc that reads as an agent pointer
cursor: 'arrow'   // classic macOS-style arrow
cursor: false     // no cursor at all
```

Projector and Capture share one implementation, so a live tour and its recorded video show the same
pointer.

### Two deliberate behaviours

**It doesn't exist until it's used.** The cursor node is created on first movement, so an idle page
never shows a stray dot before anyone presses play.

**Emphasis doesn't move it.** `highlight`, `glow`, and `spotlight` are camera moves, not
interactions — a pointer chasing every highlight reads as noise. The cursor appears for things a
person would actually do: click, type, set, toggle, drag, hover, focus, pointer taps.

### Arc motion

```js
cursorMotion: 'arc'   // default — moves bow into a slight curve
cursorMotion: 'line'  // straight lines, no curve
```

Moves longer than a short hop bow into a shallow curve rather than tracking a straight line, which
is what a hand-guided pointer actually looks like. The curve's bulge and the side it bulges toward
are derived from the move's own start and end coordinates, not from `Math.random()` — the same two
points always produce the same curve, so a captured video renders identically on every run.

Long moves (past 200px) also overshoot slightly past the target and correct back before the arrival
rings fire, reading as a deliberate landing rather than a robotic snap. Short moves — including
drag's per-frame nudges — stay straight regardless of `cursorMotion`, since a curve only reads as
motion once there's distance for the eye to follow.

### Accessibility

`prefers-reduced-motion: reduce` disables travel, rings, drift, arcing, and overshoot — the cursor
jumps straight to position. Nothing is lost, only the motion.

## Under the hood

The time scale is a single multiplier inside the runtime's `sleep()`, which is the one chokepoint
every deliberate delay passes through — see
[`packages/core/action-runtime.js`](../packages/core/action-runtime.js). The cursor is
[`packages/core/cursor.js`](../packages/core/cursor.js), injected by the Projector loader and by
Capture's `addInitScript`.
