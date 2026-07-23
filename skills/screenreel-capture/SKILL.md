---
name: screenreel-capture
description: Capture, re-capture, assemble, and verify ScreenReel product-demo videos from scripted scenes. Use for demo videos, launch videos, product walkthrough recordings, selected-scene re-recording, capture troubleshooting, or turning an interactive Projector flow into MP4 clips and a stitched reel.
---

# ScreenReel Capture

Use the same flow that powers Projector whenever possible. Capture injects the shared action executor; the target application needs stable routes and selectors, not Projector integration.

## Workflow

1. Start the target application and confirm authentication works.
2. Read `screenreel-demo-craft` before changing scene timing or story structure.
3. Validate the flow with `screenreel flow validate --flow <file> --base-url <url> --json`.
4. Test risky scenes with `screenreel flow test --flow <file> --scene <id> --screenshots <dir>`.
5. Run `screenreel capture [scene-ids]` for selective clips, `screenreel assemble` to restitch, or `screenreel record` for both.
6. Extract and inspect representative frames. Verify cursor placement, stable rendered data, visible outcome, and clean loading state.

Read [references/actions.md](references/actions.md) for the generated action contract.

## Capture invariants

- Use deterministic fixtures, dates, random values, and login state.
- Keep scenes idempotent and independently reloadable.
- Mark scenes ending in navigation with `endsInNavigation: true`.
- Prefer stable `data-*` hooks over visual classes.
- Keep one visible outcome per scene and preserve orient-act-land pacing.
- Treat exit codes as necessary but insufficient; inspect the footage.
