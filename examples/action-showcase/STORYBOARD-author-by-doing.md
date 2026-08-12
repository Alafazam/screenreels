# Storyboard — "I author it by just using my app"

Working notes for authoring the landing-page hero flow in Studio. Delete or move this file once the
flow ships.

**Audience:** a developer or PM who has been asked to make a product demo and expects to write a
script, hand-pick selectors, or re-record a video every sprint.

**The one sentence they repeat:** *"You don't write the demo — you just use your app once, and it
writes itself."*

**Flow id:** `author-by-doing` · **Route:** `./` (the landing page) · target ~45–55s total.

The app being demoed is the landing page's own live-demo fixture (`#form`, `#kpis`) — the same
surface a visitor can touch after the tour ends. Nothing is mocked.

---

## Scene 1 — "This is just your app" (orient, ~8s)

| | |
|---|---|
| Money moment | The form the visitor can see is the whole input to authoring. |
| Actions | `scrollIntoView #form` → `highlight #form` → `callout` |
| Narration | "This is your product. Nothing here is a mockup." |

Authored, not recorded — the highlight comes from a ⌘-click.

## Scene 2 — "You just use it" (act — THE money moment, ~18s)

| | |
|---|---|
| Money moment | Real interactions land on real controls, ending in the app's own toast. |
| Actions | `type #customer-name` → `set #region` → `toggle #priority` → `lever #confidence` → `click #submit-control` |
| Narration | "So use it. Type, choose, toggle, slide, submit." → "That's it. That was the authoring." |
| Visible outcome | The "Demo rocked 🤘" toast — the app acknowledging a real submit. |

**Recorded by doing.** This scene is the one you perform; the recorder writes all five actions,
coalesces your keystrokes into one `type` at your real speed, and turns your pauses into pacing.

## Scene 3 — "Studio already wrote it" (land, ~12s)

| | |
|---|---|
| Money moment | The five things you just did, shown as the flow that now exists. |
| Actions | `snippet` on the form (the recorded JSON) → `reveal [data-demo-id="cap-studio"]` with `studio-shot.png` |
| Narration | "Every one of those became an editable action." → "No selectors picked by hand." |

## Scene 4 — "Point without clicking" (differentiator, ~8s)

| | |
|---|---|
| Money moment | Emphasis is authored by the same gesture-level ease. |
| Actions | `highlight [data-kpi="margin"]` → `callout` on the KPI row |
| Narration | "Need to point at something you don't click? Hold ⌘ and click it." |

## Scene 5 — "Then it plays anywhere" (close, ~8s)

| | |
|---|---|
| Money moment | One authored flow, three surfaces. |
| Actions | `glow .kpi-card` (sequence) → `highlight [data-demo-id="final-card"]` |
| Narration | "Live in your app, on a share link, or rendered to video — same flow." |

---

## Craft rules being applied

- Each scene has exactly one outcome; nothing lands invisibly (rule: visible acknowledgement).
- Scene 2 ends in the app's own toast rather than a ScreenReel overlay.
- Narration lines stay short — a per-action line replaces the one before it, so a long line gets cut
  off by the next action. Give a narrated action room with `afterMs`/`holdMs`.
- Selectors prefer `#id` and `data-demo-id`/`data-kpi` over structural paths, so `flow doctor` can
  re-match them after a redesign.
- Every scene must be replayable from a fresh load of `./` — Scene 2 re-types over whatever the
  previous run left in the field (`clearFirst: true`).
