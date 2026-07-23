---
name: screenreel-demo-craft
description: Design the story, scene structure, talking points, pacing, selector strategy, and visible outcomes for ScreenReel interactive demos and captured videos. Use when storyboarding a product demo, converting feature lists into journeys, writing presenter notes, choosing scene boundaries, improving a weak demo, or diagnosing pacing and determinism problems.
---

# ScreenReel Demo Craft

## Shape the story

1. Name the audience and the one sentence they should repeat afterward.
2. Choose a real workflow rather than a feature inventory.
3. Give each scene one money moment: a visible result, state change, or decision.
4. Structure every scene as orient, act, land.
5. Keep repeated routes as separate scenes when their narrative purpose differs.

## Author for both outputs

- Write concise talking points for a live presenter; do not narrate every click.
- Use 8-20 seconds for recorded scenes unless the product genuinely needs more orientation.
- Let cursor movement, highlights, toasts, diffs, and changed numbers carry the recorded story.
- Expand recipes into editable primitive actions so Projector and Capture remain identical.
- Keep fixtures and displayed metrics consistent across the complete flow.

## Make automation durable

- Prefer `data-demo-id`, unique IDs, then stable `data-*` attributes.
- Add a deterministic page-global function only when a brittle click chain would otherwise be required.
- Ensure important actions produce visible acknowledgement.
- Pin theme, dates, randomness, and initial state for capture.
- Test every scene from a fresh route load.

Reject scenes that contain multiple unrelated outcomes, rely on invisible state changes, or require the presenter to explain what the audience cannot see.
