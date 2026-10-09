---
name: screenreel-narrated-scenes
description: Film one scene of a narrated product video so actions, captions and camera moves land on the narrator's words. Use when a user wants a voiced launch film or explainer cut scene by scene, asks to "do the next scene", "re-record scene N", "time this click to the word", writes or edits a per-scene JSON spec with voice text, word-anchored actions, captions or camera keys, or needs a take that continues from the previous scene.
---

# ScreenReel Narrated Scenes

A narrated scene is one JSON file: the narrator's line with pauses, mocks for the capture browser,
off-camera setup, actions on words, captions and camera keys. The voice is generated first, with
word timestamps; everything else is placed on the scene's clock from those words. Read
[docs/narrated-scenes.md](../../docs/narrated-scenes.md) for the format, the pipeline and the timing
rules before writing a spec.

This is not a built-in ScreenReel command yet. The reference implementation is a project script
(`scene.py` + `record.mjs`, listed in the doc under "Using it today"). Use the project's own copy;
if there is none, say so and propose the smallest port before building anything.

Use `screenreel-demo-craft` for the story and scene boundaries, and `screenreel-capture` for plain,
un-narrated recordings.

## The scene loop: strictly one scene at a time

1. **Recce.** Open the screens the scene needs with writes blocked (`recce`, or a throwaway script),
   take screenshots, and read the DOM of anything you will target or dress. Know what is real
   before proposing.
2. **Agree the scene.** Propose it as a table: time, on screen, camera, narrator line, captions. Say
   what is real and what the capture browser fills in. Say whether each action is the agent's (no
   cursor) or a person's (drawn cursor). Recommend one option when there is a choice. Wait for
   approval.
3. **Voice first.** Write the spec's `voice`, generate the line, and let the user listen before
   recording. A changed word moves every time after it.
4. **Plan.** Resolve every `at`; fix any timing-rule failure in the spec (start a caption earlier,
   move the last camera key) rather than loosening the rule.
5. **Record** the take. Read the take log: each action prints its planned and actual time.
6. **Check the contact sheet** of the take before wiring. Re-record until it is clean.
7. **Wire and render.** Check the rendered contact sheet, then hand over the file with a short
   summary of what changed.
8. Apply the user's feedback to this scene before starting the next.

Never commit, publish, or write to a real tenant during this loop unless the user asks.

## Writing the spec

- Name each action by the word it belongs to; use `offset` or `nth` instead of hard-coded seconds.
- One state change per `step`, at least 0.4 s apart.
- Give every step and mock a `why`.
- Prefer `demo` (`data-demo-id`) and `css` targets; resolve role targets before the take.
- Prefer camera `focus` targets over hand-measured `box`es.
- Use `continuesFrom` instead of re-creating an earlier scene's end state by hand.
- Set `blockWrites` for any real-app scene that could save, publish or run.

## Voice rules

- What the narrator says must be on screen as it is said.
- Use `<pause S>` for pauses. Do not use a TTS model that reads bracketed tags aloud.
- Keep the TTS key in the user's environment; never print or store it.
- Scripts must describe what the product really does. When unsure, ask.

## Worked example

The reference film is a product launch for Increff's planning system. Scene S10, "Start the cycle",
continues from S09 (replayed off camera), opens a dialog in setup, and then in the take: the agent
clicks **Start cycle** on "starts", fires `step` on "algorithm" and "waits" so the prototype's story
mode advances, frames the dialog and then every workflow stage with `focus` keys, and returns to
`wide` on "your". Its spec is `ms-planning-brain/ui/ai-pitch-video/launch/scenes/S10.json`.
