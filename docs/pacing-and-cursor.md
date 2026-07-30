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

### Accessibility

`prefers-reduced-motion: reduce` disables travel, rings, and drift — the cursor jumps straight to
position. Nothing is lost, only the motion.

## Under the hood

The time scale is a single multiplier inside the runtime's `sleep()`, which is the one chokepoint
every deliberate delay passes through — see
[`packages/core/action-runtime.js`](../packages/core/action-runtime.js). The cursor is
[`packages/core/cursor.js`](../packages/core/cursor.js), injected by the Projector loader and by
Capture's `addInitScript`.
