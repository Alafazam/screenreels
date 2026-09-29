# Guided tours and onboarding

Play a flow as an in-app guide the viewer paces themselves: a card beside each target with a title,
a step count, Skip, and Next. The same flow can also run as a hands-off autoplay.

```js
const projector = await ScreenReel.mount(helpButton, {
  projectId: 'app-guides',
  flow: { src: '/guides/getting-started.json' },
  loop: false,
  chooser: true,                                  // ask Guided or Autoplay before playing
  controls: { guided: [], auto: ['prev', 'play', 'next', 'exit'] }, // pill contents per mode
  studio: false,                                  // never show the Studio button
  position: 'center',                             // pill bottom-centre instead of bottom-right
  disableOnComplete: true,                        // close the tour when it finishes
  functions: { prepareShell: () => resetShell() }, // the only names `call` may run
  labels: { next: 'Weiter', stepOf: (step, total) => `${step} von ${total}` },
});

await projector.start('getting-started');                   // shows the chooser
await projector.start('getting-started', { mode: 'guided' }); // skips it
```

## How guided mode plays

- **Every callout is a step.** It stays on screen with a ring and a dim around its target until the
  viewer presses Next. Then the scene carries on, so a `click → callout → click` scene can undo
  its own change after the viewer has seen it.
- **A scene with no callout step waits at its end.** Its final highlight, spotlight, or callout
  stays up until Next. A scene that already had a step moves on after its `dwellMs`, so the viewer
  never presses Next twice for one scene.
- **Controls sit where the viewer is looking.** The card shows the step count (callouts across the
  tour), Skip, Back (from step two), and Next. Next reads Finish on the last step.
- **Keys:** → or Enter for Next, ← for Back, Esc to exit. Keys typed into the host's own inputs
  and buttons are left alone.
- **Callouts follow their target** every frame, because panels push the page around.

Mode precedence, highest first: the viewer's pick (or `start()`'s `mode`), the scene's `advance`,
the mount option `advance`, then the flow's `defaults.advance`. Autoplay is `'auto'`.

## Callouts

```json
{ "type": "callout", "selector": "[data-nav]", "title": "Navigation", "text": "Every module lives here.",
  "placement": "right", "highlight": true, "holdMs": 2400 }
```

`placement` is `auto`, `top`, `bottom`, `left`, or `right`. Left and right callouts centre on the
target vertically. A side without room flips to the opposite side. If neither fits, as with a
full-height sidebar, the callout goes to the side with the most room. It is always clamped inside
the viewport. `highlight: true` rings the target as well. `keep: 'untilSceneEnd'` on a highlight,
glow, spotlight, or callout keeps it up until the scene is left.

## Undoing what a scene changed: `cleanup`

```json
{ "id": "dark-mode", "route": "/home",
  "actions": [{ "type": "click", "selector": "#theme" }, { "type": "callout", "selector": "#theme", "text": "Dark mode" }],
  "cleanup": [{ "type": "click", "selector": "#theme" }] }
```

`cleanup` runs whenever the scene is left, for any reason: next, back, exit, pause, a choice jump,
or navigation. It runs once, to completion. Put undo steps here, not at the end of `actions`, and
an interrupted tour can never leave the app changed.

## The click shield

While a tour plays, a transparent layer covers the app, so a stray viewer click, drag, or wheel
cannot change the app mid-flow. The pill, callout controls, chooser, and choice cards sit above
it. The tour's own actions (click, type, hover, drag, scroll, the cursor) dispatch straight to
their targets and are unaffected. A click on the host's demo trigger is forwarded, so the viewer
can always turn the demo off. The layout is inline, so a missing stylesheet cannot disable it. Turn
it off with `shield: false`.

## Lifecycle

| | |
|---|---|
| `projector.start(flowId, { position, mode })` | Start or restart a flow. Throws on an unknown flow, position, or mode. |
| `screenreel:awaitingnext` | `{ projectId, flowId, sceneId, actionIndex? }`. The tour is waiting for Next. |
| `screenreel:exit` | `{ projectId, flowId, sceneId, position, reason }`. `reason` is `'user'` (pill, Skip, Esc, chooser close), `'complete'` (`disableOnComplete`), or `'api'` (a host call). |
| `screenreel:complete` | The last scene of a `loop: false` flow finished. |

A second `play()` while a scene is running warns and does nothing. Use `start()` to restart.

`functions`: when a map is passed, `call` actions resolve only through it and `registerFn`, never
through `window`. Without it, the window fallback remains for existing hosts.
