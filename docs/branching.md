# Branching with viewer choices

**What it does:** shows the viewer up to four cards and jumps playback to whichever scene they pick.
A linear tour becomes a self-serve demo that answers *their* question.

Live demo: [Chapter 6 of the showcase](../examples/action-showcase/showcase-branch.html).

## Quickest path

Add a `choice` action wherever the demo should ask:

```json
{
  "type": "choice",
  "prompt": "What do you want to see?",
  "options": [
    { "label": "Reporting",  "scene": "tour-kpis" },
    { "label": "Setup",      "scene": "tour-controls" }
  ],
  "timeoutMs": 12000,
  "defaultScene": "tour-kpis"
}
```

Playback pauses on the cards. A click jumps to that scene and continues from there — including a
route change if the target scene lives on another page.

## The fields

| Field | Meaning |
|---|---|
| `prompt` | The question above the cards |
| `options` | 1–4 × `{ label, scene }`. `scene` is a **scene id** in the same flow |
| `timeoutMs` | Auto-continue after this long. `0` (default) waits indefinitely |
| `defaultScene` | Where a timeout goes. **Required** whenever `timeoutMs > 0` |

That last requirement is enforced by validation, because a kiosk or an unattended share link with a
waiting choice and no default would stall forever.

## Where to put a choice

- **End of the tour** — "Replay" / "Talk to us" / "See pricing". Turns the last beat into a
  conversion point.
- **After the overview** — let them pick the module they care about instead of sitting through all
  four.
- **Mid-flow fork** — technical deep-dive vs business summary, from the same manifest.

Backward jumps are fine (that's how "replay" works). A viewer can loop; capture stays deterministic
because it never waits for a click.

## Validation catches dead branches

Every target is checked against the flow's scenes, on **Finish scene** in Studio and in
`screenreel flow validate`:

```
Error: branchy: start action 1: choice targets unknown scene "reprot"
Error: branchy: start action 1: choice targets disabled scene "archived-tour"
```

A **disabled** target is an error, not a warning: disabled scenes are filtered out of playback, so
the jump would silently do nothing — the worst kind of demo bug, invisible until a prospect clicks.

## In recorded video

Video is linear, so a jump has no meaning inside a clip. Capture renders the cards, briefly
highlights `defaultScene` (or the first option), and continues — the viewer of the video sees that a
choice exists without the recording stalling.

To render one branch as its own video, put the branch scenes in their own flow, or disable the
branches you don't want and re-capture.

## Reacting to a choice

Each pick emits both a DOM event and an analytics event:

```js
addEventListener('screenreel:choice', (event) => {
  const { sceneId, targetSceneId } = event.detail;   // asked in sceneId, jumped to targetSceneId
});
```

The [analytics funnel](sharing-and-analytics.md) also records a `choice` event, so branch popularity
is a `jq` away:

```bash
jq -r 'select(.event=="choice") | .targetSceneId' events.jsonl | sort | uniq -c | sort -rn
```

## Editing in Studio

Add action → **Viewer choice** (Navigation). `options` is a JSON field in v1:

```json
[{ "label": "Reporting", "scene": "tour-kpis" }, { "label": "Setup", "scene": "tour-controls" }]
```

Scene ids are on the scene list. Finish scene validates the whole graph, so a typo is caught immediately.

**Duplicating a flow remaps branches automatically** — scene ids are regenerated on copy, and choice
targets follow. Your duplicate's branches point at the duplicate's scenes, not the original's.

## Troubleshooting

**"Unknown choice target" toast during playback** — the target scene id doesn't exist in the active
flow. Playback continues linearly rather than stopping. Run `flow validate` to find it.

**The cards appear but clicking does nothing** — check the browser console for a selector error on
the *target* scene; the jump succeeded and the next scene failed.

**Cards never appear** — `options` must be a JSON array of objects with **both** `label` and `scene`
non-empty; entries missing either are dropped, and an empty list makes the action fail loudly.

**Pausing while the cards are up** — pause and exit both remove the overlay and continue linearly.
That's intentional: a presenter regaining control shouldn't be forced to answer their own question.

## Under the hood

The overlay is the one ScreenReel overlay that accepts pointer events. A click resolves
`runAction` with `{ ok: true, jumpTo: sceneId }` — an additive result channel that existing callers
ignore, so nothing else had to change. Projector resolves the target against **enabled** scenes,
because positions are enabled-relative everywhere. Graph validation is a pure function,
`ScreenReelCore.validateFlowGraph(flow)`, shared by Studio, the CLI, and the tests.
