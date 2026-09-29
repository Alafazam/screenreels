# ScreenReel guides

Task-oriented guides for each feature. The [main README](../README.md) is the reference; these
are the "how do I actually do this" walkthroughs, in the order you'd meet them.

| Guide | Answers |
|---|---|
| **[Recording a scene](recording.md)** | How do I create a demo without writing JSON by hand? |
| **[Keeping demos working](doctor-and-ci.md)** | My app changed and the demo broke. How do I find and fix it — automatically, in CI? |
| **[Voiceover](voiceover.md)** | How do I get narration on the captured video? |
| **[Personalizing with variables](variables.md)** | How do I send the same demo to ten prospects with their own names in it? |
| **[Sharing and analytics](sharing-and-analytics.md)** | How do I hand a demo to someone and see what they did? |
| **[Branching with choices](branching.md)** | How do I let the viewer pick what they see? |
| **[Pacing and the cursor](pacing-and-cursor.md)** | The demo feels rushed / I want to change the pointer. |
| **[Theming](theming.md)** | How do I make the callouts, rings, and countdown match my design system? |
| **[Guided tours and onboarding](guided-tours.md)** | How do I let the viewer click Next through a tour, and keep them from breaking the app mid-flow? |

## Before you start

Everything below assumes you can already mount Projector on a page and play a flow. If not, start
with [Projector quick start](../README.md#projector-quick-start) — it's three lines of HTML.

Two vocabulary notes that make the rest easier to read:

- A **flow** is one demo: a name, optional variables, and an ordered list of scenes.
- A **scene** is one page-worth of demo: a `route`, presenter `talkingPoints`, and a list of
  **actions** (`highlight`, `type`, `click`, `choice`, …). Scenes can span pages — the flow keeps
  its place across a full navigation.

## See it all running

```bash
pnpm build
pnpm example:serve
```

Then open <http://127.0.0.1:4173/examples/action-showcase/showcase.html> and press
**Play the journey**. Every feature in these guides is demonstrated live on those pages, and the
tour drives itself across all seven of them.
