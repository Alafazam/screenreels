# Sharing and analytics

**What it does:** hands a demo to someone as a link that plays itself with viewer-appropriate chrome,
and tells you what they did with it — without adding a backend.

Live demo: [Chapter 5 of the showcase](../examples/action-showcase/showcase-share.html).

## Share a demo

Add `?demo=play` to any page where Projector is mounted:

```
https://your-app.example/dashboard?demo=play
```

The tour starts on its own from scene one. The viewer gets **progress, play/pause, and exit** — no
flow picker, no presenter notes, no capture button, no Studio. Share mode survives the flow's own
page navigations, so a multi-page demo stays in viewer chrome the whole way. Exit restores normal
presenter mode.

Combine with [variables](variables.md) for a personalized link:

```
https://your-app.example/dashboard?demo=play&srv_company=Northstar%20Retail
```

### The three activation values

| Parameter | Effect |
|---|---|
| `?demo=1` | Turn demo mode on (pill appears, doesn't auto-play) — presenter chrome |
| `?demo=play` | Share mode: auto-play from the start, viewer chrome |
| `?demo=0` | Turn demo mode off and clear the run |

Rename the parameter with the `activationQueryParam` mount option if `demo` collides with your app.

## Measure what happened

Playback emits a funnel. Nothing leaves the page unless you ask it to.

| Event | When |
|---|---|
| `view_start` | First play of a session (fires **once**, even across page navigations) |
| `scene_enter` | A scene begins, after its route matched |
| `scene_complete` | A scene's actions finished |
| `flow_complete` | The last scene finished |
| `drop_off` | The viewer left or hid the tab **while playing** |
| `choice` | The viewer picked a [branch](branching.md) — includes `targetSceneId` |

Every event carries:

```js
{
  event: 'scene_enter',
  ts: 1785400000000,
  sessionId: '…',        // stable for the whole run, survives navigation
  projectId: 'acme-sales',
  flowId: 'sales',
  sceneId: 'overview',
  sceneIndex: 2,
  sceneCount: 6,
  percentComplete: 50,
  share: true,           // was this a share-mode viewing?
}
```

### Three ways to consume them

**1. A page listener** — zero configuration, nothing transmitted:

```js
addEventListener('screenreel:analytics', (event) => console.log(event.detail));
```

**2. A callback into your existing analytics:**

```js
await ScreenReel.mount(button, {
  projectId: 'acme-sales',
  flow: { src: '/demos/sales.json' },
  analytics: {
    onEvent: (event) => posthog.capture(`screenreel_${event.event}`, event),
  },
});
```

**3. A beacon endpoint** — one POST per event, `sendBeacon` with a `fetch(keepalive)` fallback so
`drop_off` survives the page closing:

```js
analytics: { beaconUrl: 'https://collector.example/screenreel' }
```

### A collector, if you want one

None ships — the format is JSON lines and `jq` is enough. Ten lines if you'd rather have a file:

```js
import http from 'node:http';
import fs from 'node:fs';

http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => { fs.appendFileSync('events.jsonl', body + '\n'); res.writeHead(204).end(); });
}).listen(8787);
```

Then, for example — where do viewers stop watching?

```bash
jq -r 'select(.event=="drop_off") | .sceneId' events.jsonl | sort | uniq -c | sort -rn
```

## What's in the payload — and what isn't

Events carry **manifest identifiers only**: scene ids, indices, your `projectId`. No URLs, no page
content, no form values, no PII, no cookies, no fingerprinting. Nothing is transmitted anywhere
unless you set `beaconUrl` yourself.

That's deliberate: "no backend, no account, no analytics service required" is a property of the
product, and it stays true unless you opt out of it.

## Troubleshooting

**`view_start` fires twice** — it shouldn't; it's guarded per session. If you see it, you're probably
mounting two projectors with the same `projectId`.

**`drop_off` fires when I switch tabs** — by design, it means "left while playing". It re-arms if
playback resumes, and fires at most once per interruption.

**No events at all** — the listener must be registered before playback starts, and events go to
`window`, not `document`.

**Share mode shows the full pill** — the flag lives in session storage per `projectId`; make sure
`?demo=play` was on the URL of the page that mounted, and that it's the same `projectId`.

## Under the hood

[`packages/projector/analytics.js`](../packages/projector/analytics.js) is a small ESM module
alongside `icons.js`, so it's unit-testable outside a browser. Session ids use
`crypto.randomUUID` where available and fall back for non-secure contexts. Share mode reuses the
existing "resume playback after navigation" path — `?demo=play` just arms enabled + share + playing,
so there is no separate auto-play code to keep in step.
