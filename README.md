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
  cursor: 'dot'     // 'dot', 'arrow', or false to hide the agent cursor
});
```

Projector provides flow selection, play/pause, previous/next, presenter notes, Capture Current Page, Studio, and Exit. Studio is a lazy-loaded full-screen overlay; personal flows stay in project-scoped local storage.

## Recording a scene

In Studio's scene editor, press **Record** and use your app inside the preview. Interactions become actions as you go: typing in one field coalesces into a single `type` action at your measured typing speed, checkbox/select/range changes become `toggle`/`set`/`lever`, scrolling becomes one relative `scroll` per burst, and your pauses are kept as `afterMs` pacing. A click that navigates is recorded as `goto`, and recording continues on the new page (same origin only). Press Record again or Esc to stop, then Save.

Notes: password fields are never recorded; synthetic events dispatched by the app are ignored (`isTrusted` only); after recording across a navigation, split the scene at the `goto` if save-time validation flags selectors that only exist on the second page; SPA `pushState` route changes are not yet detected.

## Agent cursor

Projector and Capture share one pointer implementation (`packages/core/cursor.js`), so a live tour and a recorded video show the same cursor. It travels to each interaction target before the action fires, emits concentric rings on arrival to mark its position, dips with a brighter ring burst on click and pointer taps, and drifts vertically while the page scrolls so motion reads as cursor-driven.

The pointer is created lazily on first use, so an idle page never shows a stray cursor. Emphasis actions (`highlight`, `glow`, `spotlight`) do not move it — those are camera moves, not interactions, and a pointer chasing every highlight reads as noise. `prefers-reduced-motion: reduce` disables travel, rings, and drift — the cursor jumps straight to position.

Set `cursor: 'arrow'` for the classic arrow glyph, or `cursor: false` to turn it off entirely.

## Pacing

`timeScale` multiplies every deliberate delay in the runtime — manifest values, action defaults, and the runtime's own internal constants (countdown steps, flash pulses, reveal fades). Rewriting timings in a manifest cannot reach the last group, which is why a single multiplier lives in the runtime instead. Timeouts and scroll-settle limits are deliberately excluded: those are limits, not pacing. Presenter notes ride the same scale, so a note never outlives the emphasis it narrates.

Defaults to `1`. Scene `dwellMs` falls back to `flow.defaults.dwellMs`, and `settleMs` to `flow.defaults.settleMs`.

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

Declare variables on a flow and reference them as `{{name}}` in action `text`, `note`, `value`, `label`, `code`, `caption`, and in scene titles/talking points:

```json
{ "id": "sales", "name": "Sales walkthrough",
  "variables": { "company": { "label": "Company name", "default": "Acme" } },
  "scenes": [{ "actions": [{ "type": "type", "selector": "#name", "text": "{{company}}" }] }] }
```

Values resolve in priority order: URL parameters (`?demo=1&srv_company=Northstar` — one link personalizes the whole run and survives cross-page navigation), then the `variables` mount option, then flow defaults. Unknown names stay literal and raise a one-time warning. Selectors, function names, and `goto` URLs are never interpolated — URL-supplied values must not steer targeting or navigation. Capture reads flow defaults automatically (`config.variables` overrides), and Studio edits the declaration via the **Variables** button on the scene list.

## Keeping demos in sync: doctor and CI

Because ScreenReel drives the live app, a renamed selector is the one way a demo can rot. Two tools close that loop:

```bash
screenreel flow doctor --flow demos/sales.json --base-url http://localhost:3000 [--fix] [--json]
```

Doctor re-validates every scene against the live DOM and proposes repairs: an ambiguous selector gets a unique re-derived selector (or `index: 0`); a dead selector is re-matched by the action's stored `fingerprint` (`{text, tag, role}`, stamped automatically when you pick targets in Studio) and rewritten when the match is confident. Without a fingerprint the doctor lists the closest candidates but never auto-fixes. `--fix` rewrites only the repaired keys in place — the rest of your file is untouched. A "has no matches" that follows a state-mutating action in the same scene is reported as a warning, not an error, because validation is a current-DOM dry run and the target may be created mid-scene.

For CI, `.github/workflows/ci.yml` runs unit tests, a dist-drift check, and browser-backed flow validation on every PR. Repos that consume ScreenReel can validate their own flows with the composite action — a broken demo becomes an inline PR annotation instead of a surprise mid-call:

```yaml
- run: npm ci
- name: Start my app
  run: npm run dev & npx wait-on http://localhost:3000
- uses: Alafazam/screenreels/.github/actions/validate-flows@main
  with:
    flow: demos/sales-demo.json
    base-url: http://localhost:3000
```

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
