# ScreenReel architecture

ScreenReel is one repository with two independently consumable products.

- `packages/core` owns manifests, action definitions, execution, validation, selector generation, and picker policy.
- `packages/projector` owns the one-script loader, custom element, live playback, notes, and host-button mounting.
- `packages/studio` is lazy-loaded by Projector and owns browser-local authoring.
- `packages/capture` adapts the shared executor to Playwright's injected cursor and recording lifecycle.
- `packages/cli` is represented by the root CLI and `lib/flow-tools.mjs` until independent publication is required.

Canonical flows belong to the host application and are immutable at runtime. Personal copies use a `screenreel:{projectId}:...:v1` namespace. Browser assets never import Capture dependencies.

The first public release is distributed as GitHub source plus self-hosted browser artifacts. There is no backend, collaboration layer, embedded model, or analytics service.
