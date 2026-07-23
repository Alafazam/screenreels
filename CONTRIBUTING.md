# Contributing

ScreenReel has one behavioral source of truth: `packages/core/action-runtime.js`. Projector, Studio, CLI Test, and Capture must use it rather than adding private action interpreters.

1. Create or update a focused test.
2. Run `npm run build` to regenerate browser assets, schema, declarations, and skill references.
3. Run `npm test`.
4. Run the Action Showcase and visually inspect the affected behavior.
5. Keep browser code free of Node, Playwright, FFmpeg, model SDKs, and network analytics.

Do not commit credentials, customer demo data, generated videos, or local flow storage.
