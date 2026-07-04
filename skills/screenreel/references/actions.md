# Screenreel scene schema and action vocabulary

## Scenes file

```json
{
  "defaults": { "settleMs": 900, "leadInMs": 1400, "tailMs": 2000 },
  "scenes": [
    {
      "id": "checkout",
      "route": "checkout.html?cart=demo",
      "waitFor": "[data-checkout-ready]",
      "title": "Journey 3 - Checkout",
      "sub": "One line shown on the scene's title card",
      "settleMs": 900,
      "leadInMs": 1400,
      "tailMs": 2000,
      "endsInNavigation": false,
      "actions": [ … ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Unique; also the clip filename (`clips/<id>.mp4`) and the CLI argument for partial re-captures |
| `route` | Appended to `baseUrl` (or a full URL) |
| `waitFor` | Selector that marks the page ready; capture waits up to 15s for it |
| `settleMs` | Extra hold after `waitFor` before the camera rolls — fonts, charts, data |
| `leadInMs` | Recorded stillness before the first action — gives the viewer a beat to read the screen |
| `tailMs` | Recorded stillness after the last action — lets the money moment land |
| `endsInNavigation` | Set `true` when the last action navigates away (click on a link, `goto`) — the rig expects the page context to die and keeps recording through the load |
| `title` / `sub` | The scene's title card (omit `title` to skip the card) |

## Actions

Common to all: `afterMs` (pause after the action), `selector` + optional `index` (nth match). Element lookups soft-fail with a console warning — the scene keeps going, so one bad selector doesn't kill a capture (but check the warnings).

| Type | Fields | What it does |
|---|---|---|
| `wait` | `ms` | Pause |
| `click` | `selector`, `timeoutMs` | Cursor travels to the element, ripple, `.click()` |
| `hover` | `selector` | Cursor + pointerover/mouseover/mouseenter |
| `fill` | `selector`, `value` | Focus a text input/textarea, set value, fire input+change |
| `glow` | `selector`, `sequence`, `stepMs`, `count`, `holdMs`, `keep`, `keepMs` | Animated rainbow border. `sequence: true` glides one box across the first `count` matches, `stepMs` apart — the camera-follow effect |
| `scroll` | `selector` (container, optional), `top`, `left`, `durMs` | Smooth scroll |
| `scrollIntoView` | `selector`, `block`, `durMs` | Smooth scroll an element into view |
| `drag` | `selector`, `dx`, `dy`, `offsetX/Y`, `durMs`, `moveTarget` | Pointer-event drag with interpolated moves; `moveTarget` for canvases that listen locally |
| `pointer` | `selector` | Raw pointerdown+up — for canvases wired on pointerdown instead of click (node-editor ports) |
| `lever` | `selector`, `to` (`max`/`min`/number), `durMs` | Animate a range input with eased, throttled `input` events, then `change` |
| `set` | `selector`, `value` | Set a range/input value instantly (one `input` event) |
| `call` | `fn`, `args`, `cursorTo` | Invoke a page-global function. `cursorTo` moves the cursor to an element first so it reads as a user action. **The cleanest way to trigger agent/AI demo moments** — expose a `window.demoXyz()` hook in the app instead of scripting fragile multi-click sequences |
| `goto` | `url` | Navigate (combine with the scene's `endsInNavigation`) |

## Worked example — an agent moment

```json
{
  "id": "mapping-agent",
  "route": "mapping-studio.html?feed=sales",
  "waitFor": ".map-row",
  "title": "The agent maps the feed",
  "sub": "Tell it about the odd column and the spec updates live",
  "actions": [
    { "type": "wait", "ms": 1200 },
    { "type": "glow", "selector": ".map-row[data-review=\"1\"]", "sequence": true, "stepMs": 1100, "count": 2, "afterMs": 500 },
    { "type": "call", "fn": "demoApplyAgentReply", "args": [], "cursorTo": "#composerInput", "afterMs": 3200 },
    { "type": "click", "selector": "[data-action=\"approve\"]", "afterMs": 1800 }
  ]
}
```

Reads on camera as: the viewer sees the two flagged rows highlighted → the cursor moves to the chat composer → the agent's reply lands and a mapping visibly updates → approve. Three beats, one money moment, ~12s.
