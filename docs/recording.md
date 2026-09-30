# Recording a scene

**What it does:** you use your app normally inside Studio's preview, and your interactions become
flow actions. No hand-written JSON, no picking selectors one at a time.

Live demo: [Chapter 1 of the showcase](../examples/action-showcase/showcase-create.html).

## Quickest path

1. Open your app with Projector mounted, and turn demo mode on (the pill appears).
2. Click the **Studio** button in the pill.
3. Open a flow. Choose **Add scene**, give it a name and optional talking points, then choose
   **Create scene**. The current page is selected automatically; readiness and timing stay under
   **Advanced timing** when you need them. To continue an existing scene, choose **Edit** instead.
4. Press **Start recording**. The first time, a short primer lists exactly what gets captured — tick
   *Don't show this again* once you know. Then the banner reads
   *"Recording — ⌘/Ctrl+click highlights · ⇧⌘/⇧Ctrl+click adds an info card · Alt+click spotlights · Esc stops"*.
5. **Use your app in the preview.** Click, type, pick from selects, scroll.
6. Press **Stop & review** (or `Esc`).
7. Press **Finish scene** to validate it and return to the scene list.

Actions appear in the timeline on the right *as you go*, so you can see it working. Every one is a
normal action afterwards — reorder it, edit its settings, delete it.

## What each interaction becomes

| You do this | You get this |
|---|---|
| Type in a field | **One** `type` action, with `charMs` measured from your actual typing speed |
| Tick a checkbox | `toggle` with the finishing state |
| Choose from a `<select>` | `set` with the chosen value |
| Drag a range slider | `lever` with the final value |
| Drag an element to another target | `drag` with the destination selector (or distance fallback) |
| Click a button or link | `click` |
| Scroll | **One** `scroll` per burst (relative, as a percentage of the viewport) |
| Pause between actions | `afterMs` on the previous action, so replay keeps your rhythm |
| Click something that navigates | `goto` — including `pushState`, `replaceState`, history, hash, and full-page navigation |
| ⌘+click (Mac) / Ctrl+click (Windows/Linux) | `highlight` on it — and the click itself never reaches your app |
| ⇧⌘+click (Mac) / ⇧Ctrl+click (Windows/Linux) | an **info card** on it, titled from the element's text — likewise swallowed |
| Alt+click something | `spotlight` on it — likewise swallowed |

The two "one" rows matter: a 20-character name is one readable `type` action, not twenty
keystrokes, and a flick of the scroll wheel is one `scroll`, not forty.

## Pointing at things: hold, then click

A demo usually needs to point at things it does not click — a KPI, a column, a badge — and adding
those from the catalog means finding each element all over again.

On macOS, hold **Ctrl** to preview the element under the cursor without committing anything. Hold
**⌘** (Ctrl on Windows/Linux) when you are ready to capture it. A box follows your pointer showing
the selector it resolved to and how many elements that selector matches. Then

- **↑** widens the target to its container, **↓** narrows it back down,
- **click** commits it — your app never sees that click, and no `click` action is recorded,
- **Esc**, or letting go of the key, cancels.

Add **Shift** to the capture key for an **info card** instead, or hold **Alt** for a `spotlight`. If the box says more than one match, widen
or narrow until it says one: an ambiguous selector is a scene that will not save.

**This works whenever the preview is loaded, not just while recording.** Mid-take the annotation
joins the same coalesced sequence as everything else. On macOS Chrome, prefer ⌘; Ctrl+click is a
right-click there.

## Info cards: one flow, Guided and Autoplay

An info card is a titled note beside an element, and it is what makes one flow work two ways:

- **Guided:** each card waits until the viewer presses Next.
- **Autoplay:** each card stays up for its autoplay time, and never less than it takes to read.

Add one with **⇧⌘/⇧Ctrl+click** while recording, or with **Info card** in the editor toolbar and a
click on the element. Its title starts as the element's own text. Type the card's words straight
into its row in the timeline. The card sits on its element in the preview while you edit, and the
row shows its step number and autoplay time. A card with no text shows **Needs text** and won't save.

**Preview as Guided / Autoplay** beside **Play scene** plays the scene the way that viewer gets it:
Guided waits for **Next** on each card in the preview.

**Flow settings** (on the scene list) sets **How viewers play it**:
- **Let viewers choose:** the default for new flows. Viewers pick Guided or Autoplay when the tour starts.
- **Guided** or **Autoplay** fixes one of them.

You never set up the rest:
- **The click shield:** while a tour plays, stray viewer clicks can't change the app.
- **Cleanup:** anything the tour changed is put back when it's closed or cut short. The timeline shows it: typed fields and toggles read **↺ Put back automatically**, and a click undone by a later click on the same element reads **↺ Undone by action N**. A click with nothing to undo it reads **May stay changed after the tour**, with an **Add undo** button.

## Things worth knowing

**The editor has three explicit states.** Ready explains the gestures; Recording keeps the product
fully interactive while locking sequence editing; Review enables editing, reordering, manual action
insertion, playback, notes, and voice. Use **Undo last** during a take or **Stop & review** when the
interaction is complete. The preview iframe is preserved across these state changes, so product
state does not reset.

**Draft changes autosave in this browser.** “Finish scene” is still deliberate: it validates routes,
selectors, action fields, and the flow graph before returning to the scene list. Autosave protects
work; Finish proves the scene is replayable.

**Play scene keeps its progress visible in Review.** The playback button reports the current action,
the running action is highlighted in the timeline, and completed actions are marked as done. If an
action has an `afterMs` pause, its row shows that wait before playback and counts down the remaining
seconds while the pause is running. Press the playback button again to stop the preview.

**Reload preview resets the product to the scene's configured page.** It does not reload an
accidental intermediate URL. Studio also restores its preview marker so a demo already embedded in
the product cannot start another projector inside the recording canvas.

**Password fields are never recorded.** Neither is anything the app dispatches itself
(synthetic events); only real user input is captured.

**After recording across a navigation, split the scene.** Finish-scene validation checks selectors
against the page currently in the preview, so a scene containing actions from two different pages
will flag the ones from the page you're no longer on. Cut the scene at the `goto` and give the
second half its own scene with the new `route`.

**Not captured automatically:** author-intent actions such as waits, wait-for conditions, callouts,
countdowns, branching choices, narration, function calls, and exact visual sequences. Add those in
Review with **Add action**, or insert them at a precise point from the plus button on an action row.
Shadow-DOM internals, `contenteditable` regions, and file inputs also remain manual because capturing
them generically would be unreliable or unsafe.

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
