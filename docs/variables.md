# Personalizing with variables

**What it does:** one flow, many prospects. Declare `{{company}}` once and every share link can carry
its own value — the demo types their name, not your placeholder.

Live demo: [Chapter 4 of the showcase](../examples/action-showcase/showcase-personalize.html).

## Quickest path

**1. Declare the variable on the flow:**

```json
{
  "id": "sales",
  "name": "Sales walkthrough",
  "variables": { "company": { "label": "Company name", "default": "Acme" } },
  "scenes": [ … ]
}
```

Shorthand also works when you only need a default: `"variables": { "company": "Acme" }`.

**2. Use it in your actions and notes:**

```json
{ "type": "type", "selector": "#customer-name", "text": "{{company}}" }
{ "type": "callout", "selector": "#plan", "text": "Recommended for {{company}}" }
```

**3. Send a personalized link:**

```
https://your-app.example/dashboard?demo=play&srv_company=Northstar%20Retail
```

The `srv_` prefix marks a ScreenReel variable, so it can't collide with your app's own query
parameters — and it's stripped before route matching, so a personalized link still matches its
scene's route.

## Where values come from

Highest priority wins:

1. **URL** — `?srv_company=Northstar` (captured once, then kept for the run)
2. **Mount option** — `variables: { company: 'Northstar' }`
3. **Flow declaration default** — `"default": "Acme"`

```js
await ScreenReel.mount(button, {
  projectId: 'acme-sales',
  flow: { src: '/demos/sales.json' },
  variables: { company: 'Northstar Retail' },   // e.g. from your own session/CRM
});
```

URL values are stored in session storage, so **a personalized link survives the demo's own page
navigations** — a flow that hops from `/dashboard` to `/reports` keeps saying the right name.

## Which fields get interpolated

Only text a human reads:

`text` · `note` · `value` · `label` · `code` · `caption` · `goText`, plus scene `title` and
`talkingPoints` (at render time only — never written back to your manifest).

**Never interpolated:** `selector`, `toSelector`, `cursorTo`, `fn`, and `goto` URLs.

That exclusion list is a security boundary, not an oversight. Variables can arrive from a URL, and:

- a URL-controlled **selector** would let a crafted link retarget actions at arbitrary elements,
  defeating the guarantee that validation checked what will actually run;
- a URL-controlled **`goto`** would be an open redirect, because the router assigns `location.href`
  at play time without re-normalizing.

If you need a per-prospect destination, use a registered [page function](../README.md#registered-page-functions)
and decide the route in your own code.

## Unknown names

An unresolved `{{name}}` stays **literal** and logs one warning per action. Two consequences worth
knowing:

- Flows with no variables are byte-identical to before — nothing to migrate.
- If you're demoing an app whose own UI contains `{{…}}` (a template editor, say), only names you
  actually declared get substituted. The rest are left alone.

## Editing variables in Studio

Open a flow → **Variables** in the toolbar. v1 edits the JSON map directly:

```json
{ "company": { "label": "Company name", "default": "Acme" }, "plan": "Enterprise" }
```

Names must match `/^[A-Za-z_]\w*$/`; invalid ones are rejected on Apply rather than failing silently
at play time.

## Capture and video

The capture path reads the owning flow's declared defaults automatically, so
`npx screenreel record` produces a video with the defaults baked in. To render a variant:

```js
// screenreel.config.mjs
export default {
  baseUrl: 'http://localhost:3000',
  variables: { company: 'Northstar Retail' },
};
```

Combine with [voiceover](voiceover.md) and the narration says the name too — `talkingPoints`
interpolate like any other display text.

## Troubleshooting

**The placeholder shows up literally on screen** — the name isn't declared and wasn't supplied. Check
spelling against the flow's `variables`, and look for the one-time console warning naming it.

**My `srv_` value is ignored** — it's read at mount. If you set it via `history.pushState` after
load, call `store.setVariables({ … })` instead.

**Values leak between demos** — they're scoped per `projectId` in session storage and cleared on
exit. Two different projects on one page can't see each other's values.

## Under the hood

There's one interpolation implementation, applied inside `runAction` in
[`packages/core/action-runtime.js`](../packages/core/action-runtime.js). Every caller — Projector,
Studio's scene preview, and the capture adapter — just passes a `variables` key, so a caller that
forgets degrades to literal text rather than crashing. Substitution is a single pass: a value
containing `{{other}}` is never re-expanded.
