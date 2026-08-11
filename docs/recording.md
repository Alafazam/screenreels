# Recording a scene

**What it does:** you use your app normally inside Studio's preview, and your interactions become
flow actions. No hand-written JSON, no picking selectors one at a time.

Live demo: [Chapter 1 of the showcase](../examples/action-showcase/showcase-create.html).

## Quickest path

1. Open your app with Projector mounted, and turn demo mode on (the pill appears).
2. Click the **Studio** button in the pill.
3. Open a flow, then open a scene (**Edit** on any row). You're now in the scene editor, with your
   app in the preview panel on the left.
4. Press **● Record**. The banner reads
   *"Recording — ⌘/Ctrl+click highlights · Alt+click spotlights · Esc stops"*.
5. **Use your app in the preview.** Click, type, pick from selects, scroll.
6. Press **Stop** (or `Esc`).
7. Press **Save**.

Actions appear in the timeline on the right *as you go*, so you can see it working. Every one is a
normal action afterwards — reorder it, edit its settings, delete it.

## What each interaction becomes

| You do this | You get this |
|---|---|
| Type in a field | **One** `type` action, with `charMs` measured from your actual typing speed |
| Tick a checkbox | `toggle` with the finishing state |
| Choose from a `<select>` | `set` with the chosen value |
| Drag a range slider | `lever` with the final value |
| Click a button or link | `click` |
| Scroll | **One** `scroll` per burst (relative, as a percentage of the viewport) |
| Pause between actions | `afterMs` on the previous action, so replay keeps your rhythm |
| Click something that navigates | `goto` — and recording continues on the new page |
| ⌘/Ctrl+click something | `highlight` on it — and the click itself never reaches your app |
| Alt+click something | `spotlight` on it — likewise swallowed |

The two "one" rows matter: a 20-character name is one readable `type` action, not twenty
keystrokes, and a flick of the scroll wheel is one `scroll`, not forty.

The two modifier rows are how you narrate *emphasis* while recording. A demo usually needs to point
at things it does not click — a KPI, a column, a badge — and stopping to add those from the catalog
afterwards means finding each element again. Hold ⌘ (or Ctrl) and click it instead: you get a
`highlight` on exactly what you pointed at, your app never sees the click, and no `click` action is
recorded alongside it. On macOS Chrome, prefer ⌘ — Ctrl+click is a right-click there.

## Things worth knowing

**Recording stops if you edit the timeline.** Deleting a row, reordering, going back, or saving all
end the session — the preview has to be rebuilt, which would lose your app's state. The banner
disappearing is the signal. Record, stop, *then* edit.

**Password fields are never recorded.** Neither is anything the app dispatches itself
(synthetic events); only real user input is captured.

**After recording across a navigation, split the scene.** Save-time validation checks selectors
against the page currently in the preview, so a scene containing actions from two different pages
will flag the ones from the page you're no longer on. Cut the scene at the `goto` and give the
second half its own scene with the new `route`.

**Single-page apps that navigate via `pushState`** don't emit a `goto` (there's no page load to
detect). Recording continues correctly; you just add the `goto` yourself.

**Not captured:** shadow-DOM internals, `contenteditable` regions, and file inputs.

## Tuning the result

The recorder aims for watchable, not literal. If the replay feels off:

- **Typing too fast or slow** — edit `charMs` on the `type` action (it's clamped to 20–200ms when
  measured, but you can set anything).
- **Pauses too long** — measured gaps are rounded to 100ms and capped at 5s; edit `afterMs`.
- **A scroll went the wrong distance** — the action is a normal `scroll` with `amount` as a
  viewport percentage. Edit it, or replace it with `scrollIntoView` on a specific target, which is
  more robust.

## Under the hood

The pure event→action logic lives in [`packages/studio/recorder.js`](../packages/studio/recorder.js)
as a `Coalescer` class with no DOM dependencies, so it's unit-tested directly
([`test/recorder.test.mjs`](../test/recorder.test.mjs)). The DOM half normalizes trusted iframe
events into plain records and survives same-origin navigations by listening on the frame element
itself. Selectors come from the same `selectorFor` used by the target picker, so recorded targets
follow the stable-selector preference order: `data-demo-id`, then a unique `id`, then a unique
`data-*` attribute, then a short structural path.

## Next

The recorder also stamps a `fingerprint` on each target — that's what lets
[the doctor](doctor-and-ci.md) repair the flow when your app changes.
