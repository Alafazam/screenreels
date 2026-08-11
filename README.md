# ScreenReel

Author one scripted product journey, present it live inside the product, and capture the same flow as polished video.

**Live demo: [alafazam.com/screenreels](https://alafazam.com/screenreels/)** — the guided tour plays automatically when you press *Open live demo*. Deployed from `main` by `.github/workflows/pages.yml`; the published artifact is built by `npm run build:pages`.

ScreenReel contains two independent products backed by one action runtime:

- **Projector + Studio** — a self-hosted browser integration for live demos, presenter notes, and browser-local authoring.
- **Capture** — a Playwright/FFmpeg CLI that records the same scenes as exact-seekable H.264 clips and a stitched MP4.

No backend, account, analytics service, or model provider is required.

## Projector quick start

Build and copy the browser distribution into your application:

```bash
npm run build
node bin/screenreel.mjs projector install --out /path/to/app/public/vendor/screenreel
```

Add one script and the provided custom element:

```html
<script src="/vendor/screenreel/screenreel.js" defer></script>

<screenreel-projector
  project-id="acme-sales"
  flow-src="/demos/sales-demo.json">
</screenreel-projector>
```

Or attach ScreenReel to an existing application button:

```js
await ScreenReel.ready;

const projector = await ScreenReel.mount(document.querySelector('#demo-button'), {
  projectId: 'acme-sales',
  flow: { src: '/demos/sales-demo.json' },
  loop: false,
  strict: true,
  timeScale: 1,     // pacing multiplier for every delay in the runtime
  cursor: 'dot',    // 'dot', 'arrow', or false to hide the agent cursor
  narration: true,  // speak each scene's talking points aloud; false to disable
  pages: ['/dashboard', '/reports']  // optional: routes Studio offers when picking a scene's route
});
```

Projector provides flow selection, play/pause, previous/next, presenter notes, Capture Current Page, Studio, and Exit. Studio is a lazy-loaded full-screen overlay; personal flows stay in project-scoped local storage.

## Guides

Task-oriented walkthroughs for each capability live in **[docs/](docs/README.md)**:

| Guide | Answers |
|---|---|
| [Recording a scene](docs/recording.md) | Create a demo by using your app, not by writing JSON |
| [Keeping demos working](docs/doctor-and-ci.md) | Find and auto-repair steps your app broke; gate it in CI |
| [Voiceover](docs/voiceover.md) | Narrate the captured video from the notes you already wrote |
| [Personalizing with variables](docs/variables.md) | One demo, per-prospect names via `?srv_company=…` |
| [Sharing and analytics](docs/sharing-and-analytics.md) | Hand over a self-playing link and see what viewers did |
| [Branching with choices](docs/branching.md) | Let the viewer pick what they see |
| [Pacing and the cursor](docs/pacing-and-cursor.md) | Make it calmer; change or hide the pointer |

The sections below are the reference: formats, options, and CLI surface.

## Agent cursor and pacing

Projector and Capture share one pointer implementation, so a live tour and a recorded video show the same cursor: it travels to each interaction target, emits rings on arrival, dips on click, and drifts while the page scrolls. `cursor: 'dot'` (default), `'arrow'`, or `false`. `prefers-reduced-motion: reduce` disables the motion.

`timeScale` multiplies every deliberate delay in the runtime — manifest values, action defaults, and internal constants (countdown steps, flash pulses, reveal fades) that manifest rewriting cannot reach. Timeouts and scroll-settle limits are excluded: those are limits, not pacing. Defaults to `1`. Scene `dwellMs` falls back to `flow.defaults.dwellMs`, `settleMs` to `flow.defaults.settleMs`.

See [Pacing and the cursor](docs/pacing-and-cursor.md).

## Flow format

```json
{
  "schemaVersion": 1,
  "flows": [{
    "id": "sales",
    "name": "Sales walkthrough",
    "scenes": [{
      "id": "overview",
      "enabled": true,
      "route": "/dashboard?team=sales",
      "waitFor": "[data-page-ready]",
      "timeoutMs": 12000,
      "settleMs": 300,
      "title": "Start with the outcome",
      "talkingPoints": "Explain what changed and why it matters.",
      "dwellMs": 5000,
      "actions": [
        { "type": "glow", "selector": ".kpi-card", "sequence": true, "count": 4 },
        { "type": "click", "selector": "[data-action=\"open-review\"]" }
      ]
    }]
  }]
}
```

Projector accepts a same-origin or CORS-enabled JSON URL, an inline object through `ScreenReel.mount`, or JSON stored in a `<script type="application/json">` referenced with `flow-data`.

Legacy `{ defaults, scenes }`, Increff-style `{ version, steps }`, `fill`, and existing Capture actions remain supported.

`waitFor` delays all scene actions until its selector is visible. `timeoutMs` defaults to `8000`; `settleMs` adds an optional render buffer after readiness. In `strict` mode, a failed action pauses playback and emits `screenreel:validation`. `loop` defaults to `true` for 0.2.x compatibility; set it to `false` to stop on the final enabled scene and receive `screenreel:complete`.

## SPA routing

MPAs work without an adapter. SPAs supply three small hooks:

```js
const comparableRoute = (route) => {
  const url = new URL(route, location.href);
  return `${url.pathname.replace(/\.html$/, '')}${url.search}${url.hash}`;
};

ScreenReel.mount(button, {
  projectId: 'sales-spa',
  flow: { data: manifest },
  router: {
    getRoute: () => router.currentUrl,
    navigate: (route) => router.navigate(route),
    subscribe: (listener) => router.onChange(listener)
  },
  routesEqual: (currentRoute, sceneRoute) =>
    comparableRoute(currentRoute) === comparableRoute(sceneRoute)
});
```

`getRoute()` and `navigate()` must describe the same route space as `scene.route`. For a legacy flow containing `ai-workbench.html?task=x` while the SPA exposes `/ai-workbench?task=x`, either map both directions in the router bridge or provide `routesEqual`. The matcher receives the raw current and scene routes; normalized same-origin equality remains the fallback when it is absent.

See `examples/spa-router/` for a dependency-free History API implementation with asynchronous scene readiness.

## Registered page functions

Register component-owned functions instead of relying on globals. ScreenReel awaits returned promises before continuing:

```js
const unregister = ScreenReel.registerFn('loadReview', async (reviewId) => {
  await reviewStore.load(reviewId);
});

// Component cleanup:
unregister();
```

`call` actions resolve the registry first and retain `window[action.fn]` as a compatibility fallback.

## Browser validation

Validate the active or named scene against the current document:

```js
const report = projector.validateScene();
const another = ScreenReel.validateScene('review-scene');
```

Reports include route/readiness errors and per-action failures for `selector`, `toSelector`, `cursorTo`, and registered functions. Validation is a current-DOM dry run; targets intentionally created by earlier actions may not exist yet.

## Agent-friendly flow commands

```bash
screenreel flow inspect --base-url http://localhost:3000 --route /dashboard --json
screenreel flow validate --flow demos/sales.json --base-url http://localhost:3000 --json
screenreel flow test --flow demos/sales.json --scene overview --base-url http://localhost:3000 --screenshots ./checks --json
screenreel flow migrate --input legacy.json --output screenreel.demo.json --json
```

These commands return stable machine-readable scene, action, selector, match, error, and screenshot data. They do not upload DOM or product data.

## Personalizing a demo

Declare `variables` on a flow and reference them as `{{name}}` in action `text`, `note`, `value`, `label`, `code`, and `caption`, plus scene titles and talking points. Values resolve URL (`?srv_company=…`) > mount option > flow default. Selectors, function names, and `goto` URLs are never interpolated, so a crafted link cannot retarget actions or redirect the page.

Full walkthrough: **[docs/variables.md](docs/variables.md)**.

## Branching with viewer choices

A `choice` action shows 1–4 cards; clicking one jumps playback to the named scene, turning a linear tour into a self-serve demo. Targets are graph-validated on Studio save and by `flow validate` — an unknown or disabled target is an error, not a silent no-op. Captured video auto-picks `defaultScene` so it stays linear.

Full walkthrough: **[docs/branching.md](docs/branching.md)**.

## Sharing a demo and measuring it

Send `?demo=play` (optionally with `srv_` variables) and the tour auto-plays with viewer chrome only — progress, play/pause, and exit. Playback emits a funnel (`view_start`, `scene_enter`, `scene_complete`, `flow_complete`, `drop_off`, `choice`) as `screenreel:analytics` events, an `analytics.onEvent` callback, and an optional `analytics.beaconUrl`. Nothing leaves the page unless you configure a beacon; payloads carry manifest identifiers only.

Full walkthrough: **[docs/sharing-and-analytics.md](docs/sharing-and-analytics.md)**.

## Keeping demos in sync: doctor and CI

Because ScreenReel drives the live app, a renamed selector is the one way a demo can rot.

```bash
screenreel flow validate --flow demos/sales.json --base-url http://localhost:3000 --json
screenreel flow doctor   --flow demos/sales.json --base-url http://localhost:3000 [--fix] [--json]
```

Doctor re-validates every scene against the live DOM and repairs what it can: an ambiguous selector gets a unique re-derived selector (or `index: 0`), and a dead selector is re-matched by the action's stored `fingerprint` (`{text, tag, role}`, stamped automatically when you pick a target in Studio or record a scene). Without a fingerprint it ranks candidates but never auto-fixes. `.github/workflows/ci.yml` gates every PR, and `.github/actions/validate-flows` gives consumer repos inline PR annotations when a product change breaks their demo.

Full walkthrough: **[docs/doctor-and-ci.md](docs/doctor-and-ci.md)**.

## Capture

Install from GitHub or a local tarball, then scaffold a capture configuration:

```bash
npm install --save-dev "git+ssh://git@github.com/Alafazam/screenreels.git"
npx screenreel init
```

Set `baseUrl`, authentication hooks, output paths, and the shared flow file in `screenreel.config.mjs`. Start the application before recording.

```bash
npx screenreel record
npx screenreel capture scene-a scene-b
npx screenreel assemble
```

### Voiceover

`--voice` (or `voice.enabled: true` in the config) narrates each scene from `scene.narration ?? scene.talkingPoints` — the script you already write for presenter notes becomes the voice track. No account or model provider is required: the default provider is macOS `say`, and `command` runs any CLI template, local or cloud:

```js
voice: {
  enabled: true,
  provider: 'say',            // macOS built-in; voiceName/rate optional
  // provider: 'command',     // any TTS CLI, e.g. piper or espeak:
  // command: 'espeak -f {textFile} -w {outFile}',
  // provider: { synthesize: async (text, outFile) => { /* your own engine */ } },
  overflow: 'extend',         // narration longer than the clip freezes the last frame
}
```

Every stitched part carries the same AAC 48 kHz stereo shape (silence on title cards and unnarrated scenes), so the concat stays in sync; assemble refuses to stitch if any part's audio shape is wrong. A cloud engine drops in through `command` (e.g. an `openai speech`-style CLI) or a custom `synthesize` — the choice, and the API key, stay yours.

Capture uses local Chrome or `CHROME_PATH`. FFmpeg and ffprobe ship with the source installation. Projector's downloadable browser artifact contains none of these Node dependencies.

## Examples

```bash
npm run build
npm run example:serve
```

Open `http://127.0.0.1:4173/examples/action-showcase/`. The same page is deployed at [alafazam.com/screenreels](https://alafazam.com/screenreels/).

- `action-showcase` ships two flows: `guided-tour` is the 6-scene landing-page story, and `action-showcase` exercises every action family, local Studio, Projector, CLI Test, and Capture. The showcase flow's drag, pointer, container-scroll, `waitFor`, and `call` fixtures live on `destination.html` so the landing page stays focused on the story.
- `spa-router` demonstrates framework-independent SPA navigation.
- `inline-flow` demonstrates an existing button and inline data without a build system.

With the example server running:

```bash
npm run example:validate
npm run example:test
npm run example:capture
```

## Skills and AI enablement

The repository ships an intent router and focused skills for Projector, Capture, and Demo Craft. AI tools operate through local files, the running application, screenshots, and structured CLI output. ScreenReel does not embed an LLM SDK or require API keys.

Studio's **Copy AI context** command copies the current scene, actions, validation failures, and stable targets as JSON for use in Codex, Claude, Cursor, or another assistant.

For an existing demo runtime, pass `legacyStorage` to copy old local/session keys once without deleting them. See `docs-increff-migration.md` for the current Increff adapter contract.

## Local data and security

ScreenReel keys are isolated under `screenreel:{projectId}:...:v1`. Clear Local Data removes only the current project namespace. Canonical flows are immutable; editing creates a personal copy.

Navigation is same-origin by default. Page-function actions accept a named global plus JSON arguments and never evaluate arbitrary JavaScript. Remote flow files require HTTPS and CORS. Studio availability is not an authorization boundary; do not put secrets in demo flows.

## Development

```bash
npm run build
npm test
npm run build:pages    # required before test:browser — it covers the deployed artifact
npm run test:browser
```

The build generates browser assets, JSON Schema, TypeScript declarations, and skill action references from the shared action registry. See `docs-architecture.md`, `CONTRIBUTING.md`, and `SECURITY.md`.

## Deployment

`.github/workflows/pages.yml` publishes `_site/` to [alafazam.com/screenreels](https://alafazam.com/screenreels/) on every push to `main`. `build:pages` fingerprints `app.js`, `fixtures.js`, and the projector runtime with a content hash, so any change to those bytes produces a new `?v=` URL and the CDN cannot serve a stale copy. The runtime key covers the whole `dist/projector` directory because the loader copies its own query onto every asset it pulls in.

The browser smoke test loads `_site/index.html` as well as `examples/`, since the deployed artifact has different asset paths and its page scripts share one global scope.

## License

Apache-2.0. Bundled Lucide icon paths are ISC-licensed; see `NOTICE`.
