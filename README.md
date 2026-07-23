# ScreenReel

Author one scripted product journey, present it live inside the product, and capture the same flow as polished video.

[Open the live ScreenReel demo](https://alafazam.com/screenreels/)

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
  strict: true
});
```

Projector provides flow selection, play/pause, previous/next, presenter notes, Capture Current Page, Studio, and Exit. Studio is a lazy-loaded full-screen overlay; personal flows stay in project-scoped local storage.

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

Capture uses local Chrome or `CHROME_PATH`. FFmpeg and ffprobe ship with the source installation. Projector's downloadable browser artifact contains none of these Node dependencies.

## Examples

```bash
npm run build
npm run example:serve
```

Open `http://127.0.0.1:4173/examples/action-showcase/`.

- `action-showcase` exercises every action family, local Studio, Projector, CLI Test, and Capture.
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
```

The build generates browser assets, JSON Schema, TypeScript declarations, and skill action references from the shared action registry. See `docs-architecture.md`, `CONTRIBUTING.md`, and `SECURITY.md`.

## License

Apache-2.0. Bundled Lucide icon paths are ISC-licensed; see `NOTICE`.
