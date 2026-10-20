# ScreenReel landing demo recording worksheet

This is the deterministic six-scene, approximately 90-second dogfood script for the landing-page live demo. Start from a fresh `demo-lab.html` load and use the app as a presenter would. The target audience is a CTO or director evaluating whether demos can live with the product and source code.

## Recording contract

| Scene | Route and title | Intended gestures | Expected actions | Target | Narration | Visible state |
|---|---|---|---|---:|---|---|
| 1 | Landing / Open-source product demos | Highlight badge and statement; point to Demo Lab | callout, callout, pointer, goto | 18s | “ScreenReel is a free, open-source demo recorder. Apache 2.0, no account, no backend, and nothing hosted for you to trust.” · “Record a walkthrough once, keep it as a file in your repository, and play it inside your own product. Let's build one.” | Open-source positioning and live-demo CTA |
| 2 | `demo-lab.html` / Record by using the app | Type name; choose audience; toggle notes; move pacing | callout, type, set, toggle, lever | 16s | “This is the Demo Lab, a small test app. The tour names the demo, picks an audience, turns on presenter notes, and sets the pace. Each one is a real browser event, and Studio saves each one as an action you can edit.” | Demo brief acknowledges each change |
| 3 | `demo-lab.html` / Emphasise real elements | Drag scene 03 above scene 02; highlight a scene; point to Generate | callout, drag, highlight, pointer, goto | 11s | “Drag a scene to change the order. To show something without clicking it, point at the real element, and it becomes a highlight in the flow. Then generate the outputs.” | Reordered scene list and visible preview |
| 4 | `demo-lab-output.html` / Three useful outputs | Highlight live, share, and video cards on their words; then the readable flow | callout, highlight ×3, callout | 16s | “One flow, three outputs. It plays live inside your product, opens as a self-playing link, and renders to video.” · “All three come from the same JSON file, which you review and version next to your code.” | Three output cards and readable JSON |
| 5 | `demo-lab-output.html` / Keep it from rotting | Scroll to maintenance and show the repair output | scroll, callout, goto | 9s | “When your product changes, flow doctor checks every target and repairs the selectors that moved, before a customer sees a broken demo.” | Repair output and Flow Doctor link |
| 6 | Landing / Make the next step obvious | Highlight live-demo and repository actions; point to GitHub | callout, pointer | 7s | “That was ScreenReel, playing itself. Read every line on GitHub, and put it in your own product.” | Live-demo and GitHub CTAs |

Total: about 77 seconds of narrated steps plus page loads, under the 90-second target.

## Voice

The tour is voiced with ElevenLabs (voice Matilda, `eleven_multilingual_v2`). Each info card's `narration` is its line, and the card plays `audio/landing/<step>.<hash>.mp3`. The card's `stepMs` and its actions' `atMs` come from the take's word timestamps: an action named by a word fires 0.45 s before the word. The landing mounts with `narration: { speech: false }`, so only the files play. The chooser offers Autoplay (first and focused), Video, and Guided, and all three play the files.

To change a line, edit the card's `narration` in `screenreel.demo.json`, then run:

```bash
node scripts/voice-render.mjs --plan examples/action-showcase/audio/landing/voice-plan.json --dry-run
node scripts/voice-render.mjs --plan examples/action-showcase/audio/landing/voice-plan.json
```

Only changed lines are generated again. The key comes from `ELEVENLABS_API_KEY`. The plan file (`voice-plan.json`) sets the voice and says which action lands on which word. In Guided mode, each card plays its line while it waits for Next, and the actions run after Next.

## Guided recording steps

1. Open `demo-lab.html` in a fresh browser context. Reset any existing draft by reloading; the fixture does not use local storage, dates, randomness, or network data.
2. In Studio, duplicate or create the recording flow, add Scene 1, and press Start recording. Use the page preview, not an imaginary product window.
3. Stop and review after each scene. Add narration, countdowns, exact waits, callouts, highlights, spotlights, and presenter intent manually during Review.
4. Finish the scene before navigating. Each navigation is a scene boundary because Finish-scene validation checks selectors against the current route.
5. Start Scene 2 on `demo-lab.html`, perform the brief controls in order, then finish and review. Use stable `data-demo-id` targets (`demo-name`, `audience`, `presenter-notes`, `pacing`, `scene-01` to `scene-03`, `result-preview`, `generate-outputs`).
6. Click Generate demo outputs to navigate to `demo-lab-output.html`; finish Scene 4 there. Use `live-output`, `share-output`, `video-output`, `readable-flow`, and `flow-doctor-link` as durable targets.
7. Finish Scene 5 on `demo-lab-output.html`, using the visible `doctor-output` repair result. Return to the landing page only after finishing that scene, then finish Scene 6.
8. Play the complete flow from scene 1. Confirm that it is understandable without narration, then export the final demo and use it as the landing-page product demo.

## Dogfooding ledger

| Step | Expectation | Observation | Severity | Reproducibility | Workaround | Candidate fix |
|---|---|---|---|---|---|---|
| Fresh load | Fixture begins in the same state every time | `demo-lab.html` text identical across two loads | — | Always | — | — |
| Brief controls | Each input visibly acknowledges the change | Name, audience, notes, and pacing each update the status card | — | Always | — | — |
| Scene reorder | Dragging changes order and remains readable | Dropping scene 03 on scene 01 gives 03, 01, 02 | — | Always | — | — |
| Output navigation | Generate action reaches output route | Reaches `demo-lab-output.html` | — | Always | — | — |
| Output actions | Live/share/video controls provide clear feedback | Each button shows its toast; Copy writes the share link to the clipboard | — | Always | — | — |
| Cross-route recording | Finish-scene validation passes at each boundary | Not run in this pass — needs a hands-on Studio recording across routes | — | — | — | Record scenes 1–6 by hand |
| Flow doctor | Existing repair demo opens and is understandable | Link opens `showcase-heal.html` (“It refuses to rot.”) | — | Always | — | — |
| Replay | Six scenes replay from scene one without broken targets | All six complete with no page errors; `flow validate` passes all 10 scenes. Runs 45 s with speech stubbed against the 90 s target | P3 | Always | — | Time it with real narration before retuning `dwellMs` |

Fixed during the 2026-09-30 pass, each with a smoke regression: the final scene's `hero-actions` highlight ringed empty space because the group spanned the full column (now `width: fit-content`); the pill intro beat threw once the projector was disabled mid-beat; and the Studio preview-reload check could not see into Studio's shadow root.

Record every rough edge before fixing it. A defect is ready for a code change only when it has an observation, a reproducible path, and an isolated regression test.
