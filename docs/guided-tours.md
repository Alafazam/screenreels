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

A flow can carry its own playback in `defaults.advance`:
- `'ask'` shows the chooser. It's the default for flows created in Studio.
- `'guided'` and `'auto'` fix the mode.

A host's `chooser` or `advance` mount option overrides it. See [Recording a scene](recording.md#info-cards-one-flow-guided-and-autoplay) for authoring all of this in Studio.

## How guided mode plays

- **Every callout is a step, and only callouts are.** A callout ignores its `holdMs` and stays on
  screen, with a ring and a dim around its target, until the viewer presses Next. Then the scene
  carries on, so a `click → callout → click` scene can undo its own change after the viewer has
  seen it, and a `choice` after a callout still shows. Everything else plays through, and a scene
  with no callout (a countdown intro, say) moves on after its `dwellMs`.
- **Next on the last scene of a `loop: false` flow completes the tour**, whether it comes from the
  card, the keyboard, or the pill.
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

## Undoing what a tour changed: automatic, with `cleanup` for the rest

A tour puts the app back by itself. Before it changes a form control (`type`, `set`, `toggle`,
`lever`), it records the old value. A click that the same scene repeats later on the same element,
such as a theme toggle, is treated as a pair: the second click undoes the first.

When those are undone:
- **A scene cut short** (Next mid-scene, Back, a choice jump, pause) undoes its own changes. Back also undoes the scene it returns to, so replaying it can't apply a toggle twice.
- **Closing or finishing the tour** undoes everything, newest first.
- **A scene that plays through** keeps its changes, so the next scene can build on them.

For anything else, add `cleanup` actions. Studio's **Add undo** does this for a click:

```json
{ "id": "dark-mode", "route": "/home",
  "actions": [{ "type": "click", "selector": "#theme" }, { "type": "callout", "selector": "#theme", "text": "Dark mode" }],
  "cleanup": [{ "type": "click", "selector": "#theme" }] }
```

`cleanup` runs whenever the scene is left, for any reason: next, back, exit, pause, a choice jump,
or navigation. It runs once, to completion.

The card is white by default. Restyle it, and the rings, countdown, and choice cards, with
`--sr-*` properties: see [Theming](theming.md).

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

`restoreOnExit: true` takes the viewer back to where they started the tour when they close it (✕,
Skip, Esc, the trigger) or finish it: the same route and scroll position, across a full page load
if the tour navigated away. `start()` records the starting point.

`functions`: when a map is passed, `call` actions resolve only through it and `registerFn`, never
through `window`. Without it, the window fallback remains for existing hosts.
