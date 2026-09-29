# ScreenReel landing demo recording worksheet

This is the deterministic six-scene, approximately 90-second dogfood script for the landing-page live demo. Start from a fresh `demo-lab.html` load and use the app as a presenter would. The target audience is a CTO or director evaluating whether demos can live with the product and source code.

## Recording contract

| Scene | Route and title | Intended gestures | Expected actions | Target | Narration | Visible state |
|---|---|---|---|---:|---|---|
| 1 | Landing / Open-source product demos | Highlight badge and statement; point to Demo Lab | highlight, spotlight, pointer, goto | 12s | “ScreenReel is an open-source demo recorder that ships with your product. No account, backend, or hosted workspace.” | Open-source positioning and live-demo CTA |
| 2 | `demo-lab.html` / Shape the story | Type name; choose audience; toggle notes; move pacing | type, set, toggle, lever | 17s | “Open Studio, press record, and use your app normally. Typing, selects, toggles, sliders, clicks, and navigation become editable actions.” | Demo brief acknowledges each change |
| 3 | `demo-lab.html` / Emphasise real elements | Drag scene 03 above scene 02; highlight scene and spotlight preview | drag, highlight, spotlight, pointer, goto | 14s | “When a moment needs emphasis, point at the real element and capture a highlight or spotlight. Your demo remains a readable flow in the repository.” | Reordered scene list and visible preview |
| 4 | `demo-lab-output.html` / Three useful outputs | Walk live, share, and video cards; highlight readable flow | glow sequence, highlight | 17s | “That one flow now plays live inside the product, opens as a self-playing link, and renders to video. Projector, Studio, and Capture share the same source.” | Three output cards and readable JSON |
| 5 | `demo-lab-output.html` / Keep it from rotting | Scroll to maintenance and spotlight genuine repair output | scroll, spotlight, goto | 16s | “When the product changes, validation catches broken targets, and flow doctor can repair fingerprinted selectors before a customer sees the break.” | Genuine repair output and Flow Doctor link |
| 6 | Landing / Make the next step obvious | Highlight live-demo and repository actions; point to GitHub | highlight, pointer | 14s | “Everything stays in your stack. Watch the live demo, inspect every line on GitHub, and use ScreenReel in your own product.” | Live-demo and GitHub CTAs |

Total target duration: 90 seconds. Keep the narration conversational; the times are pacing targets, not hard waits.

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
